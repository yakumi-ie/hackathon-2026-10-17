"""元マップに紐づく Google 施設 ID から地点名を補完する。"""
import base64
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    # 現在収録している地点の施設 ID だけを調べ、取得済みの名前は再利用する。
    data = json.loads(DATA.read_text())
    locations = _source_places()
    names = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    ids = sorted({locations.get(_key(p['videoId'], p['latitude'], p['longitude']))
                  for p in data['places']} - {None} - names.keys())
    print(f'Fetching {len(ids)} place names', flush=True)

    # 取得頻度を抑え、取得先の制限を受けたら保存して終了する。
    for index, place_id in enumerate(ids, 1):
        try:
            name = _lookup_name(place_id)
        except urllib.error.HTTPError as error:
            print(f'HTTP {error.code}: stopped; keeping confirmed names', flush=True)
            break
        if name:
            names[place_id] = name
        if index % 20 == 0:
            _save(CACHE, names)
            print(f'{index}/{len(ids)} checked, {len(names)} names available', flush=True)
    _save(CACHE, names)

    # 確認できた施設名だけを、動画と座標が一致する登録へ反映する。
    for place in data['places']:
        place_id = locations.get(_key(place['videoId'], place['latitude'], place['longitude']))
        place['name'] = names.get(place_id, 'マップ掲載地点')
    _save(DATA, data)
    print(f"Named places: {sum(p['name'] != 'マップ掲載地点' for p in data['places'])}/{len(data['places'])}", flush=True)


def load_place_names():
    if not CACHE.exists():
        return {}
    names = json.loads(CACHE.read_text())
    return {key: names[place_id] for key, place_id in _source_places().items() if place_id in names}


def _source_places():
    with urllib.request.urlopen(SOURCE, timeout=30) as response:
        page = response.read().decode()
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
    time.sleep(1)
    raw = base64.urlsafe_b64decode(place_id + '=' * (-len(place_id) % 4))
    feature_id = f'0x{int.from_bytes(raw[3:11], "little"):x}:0x{int.from_bytes(raw[-8:], "little"):x}'
    query = urllib.parse.urlencode({'hl': 'ja', 'gl': 'jp', 'pb': f'!1m2!1s{feature_id}!2s'})
    try:
        with urllib.request.urlopen(f'https://www.google.com/maps/preview/place?{query}', timeout=15) as response:
            details = json.loads(response.read().decode().split('\n', 1)[1])[6]
        return details[11] if details and details[78] == place_id else None
    except urllib.error.HTTPError as error:
        if error.code == 429:
            raise
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, IndexError):
        return None


def _key(video_id, latitude, longitude):
    return video_id, round(latitude, 7), round(longitude, 7)


def _save(path, data):
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'src' / 'data.json'
CACHE = ROOT / 'scripts' / 'place-names.json'
SOURCE = 'https://www.google.com/maps/d/viewer?mid=13Xyxidjdp-PCcwAl2zI76WBqUSOKkX95&hl=ja'

if __name__ == '__main__':
    main()
