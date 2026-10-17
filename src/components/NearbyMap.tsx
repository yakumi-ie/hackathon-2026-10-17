import { useEffect, useRef, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import type { LatLngBounds, Map as LeafletMap, Marker, MarkerClusterGroup } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import type { Coordinates, NearbyPlace, NearbyVideo } from '../nearby'

type Props = {
  origin: Coordinates
  radius: number
  videos: NearbyVideo[]
  selectedPlace: NearbyPlace | null
  onChooseVideo: (id: string) => void
}
type MapView = { map: LeafletMap; bounds: LatLngBounds; markers: Map<string, Marker>; clusters: MarkerClusterGroup }
type Pin = { places: NearbyPlace[]; videos: { id: string; title: string; number: number }[] }

export function NearbyMap({ origin, radius, videos, selectedPlace, onChooseVideo }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const view = useRef<MapView | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [tileError, setTileError] = useState(false)

  // SSR では地図を初期化せず、検索結果が変わったときに描き直す。
  useEffect(() => {
    let disposed = false
    let map: LeafletMap | undefined
    setStatus('loading')
    setTileError(false)
    import('leaflet').then(async ({ default: L }) => {
      await import('leaflet.markercluster')
      if (disposed) return

      // ページのスクロールを保ち、検索の中心と範囲を地図へ描く。
      const center = L.latLng(origin.latitude, origin.longitude)
      const bounds = center.toBounds(radius * 2000)
      // 検索条件の変更で破棄される地図には、遅延するズーム処理を残さない。
      map = L.map(container.current!, {
        scrollWheelZoom: false,
        zoomAnimation: false,
        fadeAnimation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      }).fitBounds(bounds, { padding: [18, 18] })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).on('tileerror', () => setTileError(true)).on('tileload', () => setTileError(false)).addTo(map)
      L.circle(center, { radius: radius * 1000, color: '#0866d9', weight: 2, fillOpacity: 0.06 }).addTo(map)
      L.circleMarker(center, { radius: 7, color: 'white', weight: 3, fillColor: '#0866d9', fillOpacity: 1 }).addTo(map).bindTooltip('検索の中心')

      // 同じ座標の動画を一つのピンにまとめ、カードと共通の番号を付ける。
      const markers = new Map<string, Marker>()
      const clusters = L.markerClusterGroup({
        animate: false,
        showCoverageOnHover: false,
        maxClusterRadius: 40,
        iconCreateFunction: cluster => L.divIcon({
          className: 'location-cluster',
          html: `<span>${cluster.getChildCount()}<small>地点</small></span>`,
          iconSize: [44, 44],
        }),
      }).addTo(map)
      for (const pin of groupPins(videos)) {
        const place = pin.places[0]
        const label = `${pin.videos[0].number}${pin.videos.length > 1 ? '+' : ''}`
        const marker = L.marker([place.latitude, place.longitude], {
          icon: L.divIcon({ className: 'video-pin', html: `<span class="pin-shape"><span>${label}</span></span>`, iconSize: [36, 44], iconAnchor: [18, 44], popupAnchor: [0, -42] }),
          title: pin.videos.map(video => `${video.number}: ${video.title}`).join(' / '),
          riseOnHover: true,
        }).bindPopup(popupContent(pin, onChooseVideo), { maxWidth: 280 })
        clusters.addLayer(marker)
        for (const place of pin.places) markers.set(place.id, marker)
      }

      // 非同期の初期化後に、カードから指定された地点も選択できるようにする。
      view.current = { map, bounds, markers, clusters }
      setStatus('ready')
    }).catch(error => {
      if (disposed) return
      console.error('地図の初期化に失敗しました', error)
      setStatus('error')
    })
    return () => {
      disposed = true
      view.current = null
      map?.remove()
    }
  }, [origin, radius, videos, onChooseVideo])

  // カードが指定した地点へ寄り、その地点の動画を表示する。
  useEffect(() => {
    const current = view.current
    if (!current || !selectedPlace) return
    current.map.setView([selectedPlace.latitude, selectedPlace.longitude], Math.max(current.map.getZoom(), 15), { animate: false })
    const marker = current.markers.get(selectedPlace.id)
    if (marker) current.clusters.zoomToShowLayer(marker, () => marker.openPopup())
  }, [selectedPlace, status])

  // 地図を動かした後も、検索範囲へ戻れるようにする。
  function resetView() {
    const current = view.current
    if (!current) return
    current.map.closePopup()
    current.map.fitBounds(current.bounds, { padding: [18, 18], animate: false })
  }

  return <div className="map-frame">
    <div ref={container} className="nearby-map" role="region" aria-label="検索範囲内の動画掲載地点" />
    {status === 'ready' && <button className="map-reset" onClick={resetView}><LocateFixed size={15} />範囲に戻す</button>}
    {status !== 'ready' && <p className="map-status" role="status">{status === 'loading' ? '地図を読み込んでいます…' : '地図を読み込めませんでした。下の動画一覧をご利用ください。'}</p>}
    {tileError && <p className="map-status" role="status">背景地図を取得できません。動画一覧と経路リンクは引き続き使えます。</p>}
  </div>
}

function groupPins(videos: NearbyVideo[]) {
  const pins = new Map<string, Pin>()
  videos.forEach((video, index) => {
    for (const place of video.places) {
      const key = `${place.latitude},${place.longitude}`
      const pin = pins.get(key) ?? { places: [], videos: [] }
      pin.places.push(place)
      if (!pin.videos.some(entry => entry.id === video.id)) pin.videos.push({ id: video.id, title: video.title, number: index + 1 })
      pins.set(key, pin)
    }
  })
  return [...pins.values()]
}

function popupContent(pin: Pin, onChooseVideo: Props['onChooseVideo']) {
  const content = document.createElement('div')
  content.className = 'map-popup'
  const label = document.createElement('p')
  label.className = 'map-popup-label'
  label.textContent = [...new Set(pin.places.map(place => place.name))].join(' / ')
  content.append(label)
  for (const video of pin.videos) {
    const button = document.createElement('button')
    button.className = 'map-popup-video'
    button.textContent = `${String(video.number).padStart(2, '0')}　${video.title}`
    const action = document.createElement('span')
    action.textContent = '動画カードを見る ↓'
    button.append(action)
    button.addEventListener('click', () => onChooseVideo(video.id))
    content.append(button)
  }
  return content
}
