"""共有マップの KML から関東周辺の動画と地点を抽出する（Python 標準ライブラリのみ）。"""
import datetime
import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

SOURCE = 'https://www.google.com/maps/d/viewer?mid=13Xyxidjdp-PCcwAl2zI76WBqUSOKkX95'
EXPORT = 'https://www.google.com/maps/d/kml?mid=13Xyxidjdp-PCcwAl2zI76WBqUSOKkX95&forcekml=1'
NS = {'k': 'http://www.opengis.net/kml/2.2'}


def main():
    # KML を取得し、関東周辺の点と動画 URL がある登録だけを採用する。
    with urllib.request.urlopen(EXPORT) as response:
        root = ET.fromstring(response.read())
    videos, places = {}, []
    for marker in root.findall('.//k:Placemark', NS):
        coordinates = marker.find('.//k:Point/k:coordinates', NS)
        description = marker.findtext('k:description', '', NS)
        match = re.search(r'https?://(?:www\.)?nicovideo\.jp/watch/((?:sm|so|nm)\d+)', description)
        if coordinates is None or match is None:
            continue
        longitude, latitude, *_ = map(float, coordinates.text.strip().split(','))
        if not (139 <= longitude <= 141 and 35 <= latitude <= 36.5):
            continue

        # 動画情報を一度だけ保持し、複数の登録地点を同じ動画に紐づける。
        video_id = match[1]
        title = html.unescape(marker.findtext('k:name', '', NS)).strip()
        author = re.search(r'投稿者[：:]\s*([^<\n]+)', description)
        image = marker.find('.//k:Data[@name="gx_media_links"]/k:value', NS)
        thumbnail = image.text.split()[0] if image is not None and image.text else None
        if thumbnail and not thumbnail.startswith('https://mymaps.usercontent.google.com/'):
            thumbnail = None
        videos[video_id] = {
            'id': video_id, 'title': title,
            'url': f'https://www.nicovideo.jp/watch/{video_id}',
            'author': html.unescape(author[1]).strip() if author else '動画旅マップ掲載動画',
            'thumbnail': re.sub(r'fife=[^&]+', 'fife=w640', thumbnail) if thumbnail else None,
        }
        places.append({
            'id': f'{video_id}-{longitude}-{latitude}', 'videoId': video_id,
            'name': 'マップ掲載地点', 'latitude': latitude, 'longitude': longitude,
        })

    # 重複点を除き、出典と取得日を含む静的データとして保存する。
    places = list({place['id']: place for place in places}.values())
    data = {
        'source': SOURCE, 'importedAt': datetime.date.today().isoformat(),
        'area': '関東周辺', 'videos': list(videos.values()), 'places': places,
    }
    target = Path(__file__).resolve().parents[1] / 'src' / 'data.json'
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(videos)} videos / {len(places)} places → {target}')


if __name__ == '__main__':
    main()
