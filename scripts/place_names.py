"""元マップの施設 ID から名称を補完し、取得間隔・制限・再開を管理する。"""
import argparse
import base64
from collections import Counter
from email.utils import parsedate_to_datetime
import fcntl
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit', type=int, default=30, help='今回問い合わせる施設数（既定: 30）')
    parser.add_argument('--refresh-source', action='store_true', help='元マップのキャッシュを更新する')
    parser.add_argument('--wait', action='store_true', help='保存済みの待機期限を待ってから今回の収集を行う')
    args = parser.parse_args()
    if args.limit < 0:
        parser.error('--limit は 0 以上にしてください')
    ARTIFACTS.mkdir(exist_ok=True)

    # 同時実行を防ぎ、未取得・再確認期限を過ぎた施設を掲載件数の多い順に調べる。
    with (ARTIFACTS / 'place-name-collection.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('ほかの名称収集が実行中です。終了してから再開してください。')
        if args.wait:
            resume = _load(FETCH_STATE).get('cooldownUntil', 0)
            if resume > time.time():
                print(f'Waiting until {time.ctime(resume)}', flush=True)
            while resume > time.time():
                time.sleep(min(60, resume - time.time()))
        data = json.loads(DATA.read_text())
        names, misses = _load(CACHE), _load(MISSES)
        try:
            locations = _source_places(args.refresh_source)
        except _CollectionStopped as error:
            print(error, flush=True)
            return
        counts = Counter(locations.get(_key(p['videoId'], p['latitude'], p['longitude'])) for p in data['places'])
        ids = sorted((place_id for place_id in counts if place_id and place_id not in names
                      and misses.get(place_id, 0) <= time.time()), key=lambda place_id: (-counts[place_id], place_id))
        print(f'{len(ids)} pending; checking at most {args.limit}, at least {INTERVAL}s apart', flush=True)

        # 成功・失敗の両方を保存し、制限を受けたら次回も待機期限まで問い合わせない。
        try:
            for index, place_id in enumerate(ids[:args.limit], 1):
                name = _lookup_name(place_id)
                if name:
                    names[place_id] = name
                    misses.pop(place_id, None)
                    _save(CACHE, names)
                else:
                    misses[place_id] = time.time() + 7 * 86400
                _save(MISSES, misses)
                print(f'{index}/{min(args.limit, len(ids))}: {name or "名称未確認（7 日後まで再取得しません）"}', flush=True)
        except (_CollectionStopped, KeyboardInterrupt) as error:
            print(str(error) or '中断しました。確認済みの名称を保存します。', flush=True)

        # ID と座標が一致する名称だけを反映し、既存の確認済み名称も保持する。
        data = json.loads(DATA.read_text())
        for place in data['places']:
            place_id = locations.get(_key(place['videoId'], place['latitude'], place['longitude']))
            place['name'] = names.get(place_id, place['name'])
        _save(DATA, data)
        print(f"Named places: {sum(p['name'] != 'マップ掲載地点' for p in data['places'])}/{len(data['places'])}", flush=True)


def load_place_names():
    names = _load(CACHE)
    return {key: names[place_id] for key, place_id in _source_places().items() if place_id in names} if names else {}


class _CollectionStopped(Exception):
    pass


def _source_places(refresh=False):
    if not refresh and SOURCE_CACHE.exists() and time.time() - SOURCE_CACHE.stat().st_mtime < 86400:
        page = SOURCE_CACHE.read_text()
    else:
        page = _read_google(SOURCE)
        ARTIFACTS.mkdir(exist_ok=True)
        SOURCE_CACHE.write_text(page)
    encoded, _ = json.JSONDecoder().raw_decode(page.split('var _pageData = ', 1)[1])
    source = json.loads(encoded)
    places = {}
    for feature in _features(source):
        fields = feature[5]
        metadata = fields[-1]
        if not (isinstance(metadata, list) and len(metadata) > 1
                and isinstance(metadata[1], str) and metadata[1].startswith('ChIJ')):
            continue
        description = next((field[1][0] for field in fields if field and field[0] == '説明'), '')
        video = re.search(r'nicovideo\.jp/watch/((?:sm|so|nm)\d+)', description)
        if video:
            latitude, longitude = feature[1][0][0][:2]
            places[_key(video[1], latitude, longitude)] = metadata[1]
    return places


def _features(node):
    if not isinstance(node, list):
        return
    if node and isinstance(node[0], str) and re.fullmatch(r'[A-F0-9]{16}', node[0]):
        yield node
    else:
        for child in node:
            yield from _features(child)


def _lookup_name(place_id):
    # 元マップの施設 ID を使い、近隣施設の逆引きによる推測は行わない。
    raw = base64.urlsafe_b64decode(place_id + '=' * (-len(place_id) % 4))
    feature_id = f'0x{int.from_bytes(raw[3:11], "little"):x}:0x{int.from_bytes(raw[-8:], "little"):x}'
    query = urllib.parse.urlencode({'hl': 'ja', 'gl': 'jp', 'pb': f'!1m2!1s{feature_id}!2s'})
    try:
        page = _read_google(f'https://www.google.com/maps/preview/place?{query}')
    except urllib.error.HTTPError as error:
        if error.code in (400, 404):
            return None
        raise
    try:
        details = json.loads(page.split('\n', 1)[1])[6]
        if details is not None and not isinstance(details, list):
            raise ValueError('unexpected place details')
    except (ValueError, IndexError, KeyError, TypeError):
        _pause_collection('名称の応答形式を確認できませんでした', minimum=3600)
    return details[11] if details and len(details) > 78 and details[78] == place_id else None


def _read_google(url):
    # 前回実行の取得間隔・待機期限も守り、並列で問い合わせない。
    state = _load(FETCH_STATE)
    if state.get('cooldownUntil', 0) > time.time():
        raise _CollectionStopped(f"収集は待機中です。再開可能: {time.ctime(state['cooldownUntil'])}")
    time.sleep(max(0, state.get('lastRequestAt', 0) + INTERVAL - time.time()))
    state['lastRequestAt'] = time.time()
    _save(FETCH_STATE, state)

    # 制限や一時的な障害では即時リトライせず、Retry-After を保存して終了する。
    request = urllib.request.Request(url, headers={'User-Agent': 'Yorimichi-place-import/1.0'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            page = response.read().decode()
            redirected = response.url
    except urllib.error.HTTPError as error:
        if error.code in (403, 429) or error.code >= 500:
            state['lastError'] = {'status': error.code, 'url': url, 'retryAfter': error.headers.get('Retry-After'), 'at': time.time()}
            _save(FETCH_STATE, state)
            _pause_collection(f'HTTP {error.code}', error.headers.get('Retry-After'),
                              minimum=3600 if error.code in (403, 429) else 300, limited=error.code in (403, 429))
        raise
    except (urllib.error.URLError, TimeoutError) as error:
        _pause_collection(f'通信エラー: {error}', minimum=300)

    # CAPTCHA や異常なトラフィックの画面は回避せず、問い合わせを停止する。
    if '/sorry/' in redirected or 'our systems have detected unusual traffic' in page.lower() or '通常と異なるトラフィック' in page:
        _pause_collection('Google のアクセス制限画面を検出しました', minimum=3600, limited=True)
    state['strikes'] = 0
    _save(FETCH_STATE, state)
    return page


def _pause_collection(reason, retry_after=None, minimum=3600, limited=False):
    state = _load(FETCH_STATE)
    delay = minimum
    if limited:
        delay = min(86400, minimum * 2 ** state.get('strikes', 0))
        state['strikes'] = state.get('strikes', 0) + 1
    if retry_after:
        try:
            server_delay = float(retry_after)
        except ValueError:
            try:
                server_delay = parsedate_to_datetime(retry_after).timestamp() - time.time()
            except (ValueError, TypeError, OverflowError):
                server_delay = 0
        delay = max(delay, server_delay)
    state['cooldownUntil'] = time.time() + delay
    _save(FETCH_STATE, state)
    raise _CollectionStopped(f"{reason}: 収集を停止しました。再開可能: {time.ctime(state['cooldownUntil'])}")


def _key(video_id, latitude, longitude):
    return video_id, round(latitude, 7), round(longitude, 7)


def _load(path):
    return json.loads(path.read_text()) if path.exists() else {}


def _save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'src' / 'data.json'
CACHE = ROOT / 'scripts' / 'place-names.json'
SOURCE = 'https://www.google.com/maps/d/viewer?mid=13Xyxidjdp-PCcwAl2zI76WBqUSOKkX95&hl=ja'
ARTIFACTS = ROOT / 'artifacts'
SOURCE_CACHE = ARTIFACTS / 'source-map.html'
FETCH_STATE = ARTIFACTS / 'place-name-fetch.json'
MISSES = ARTIFACTS / 'place-name-misses.json'
INTERVAL = 8

if __name__ == '__main__':
    main()
