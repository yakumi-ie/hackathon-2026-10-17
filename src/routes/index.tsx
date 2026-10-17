import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Car, Compass, Footprints, LocateFixed, Map, MapPin, Play, Route as RouteIcon } from 'lucide-react'
import { NearbyMap } from '../components/NearbyMap'
import { VideoFeed } from '../components/VideoFeed'
import type { VideoFeedHandle } from '../components/VideoFeed'
import data from '../data.json'
import { findNearbyVideos } from '../nearby'
import type { Coordinates, NearbyPlace } from '../nearby'

type Origin = Coordinates & { label: string; demo: boolean }
type TravelMode = 'walking' | 'driving'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  // 検索条件と位置情報の取得状態を保持する。
  const [origin, setOrigin] = useState<Origin>(demoLocations[0])
  const [mode, setMode] = useState<TravelMode>('walking')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectedPlace, setSelectedPlace] = useState<NearbyPlace | null>(null)
  const request = useRef(0)
  const feed = useRef<VideoFeedHandle>(null)
  const radius = mode === 'walking' ? 1 : 10
  const videos = useMemo(() => findNearbyVideos(origin, radius), [origin, radius])
  const placeCount = videos.reduce((count, video) => count + video.places.length, 0)

  // ピンとカードの移動を、ページ内のスクロールでつなぐ。
  const chooseVideo = useCallback((id: string) => {
    feed.current?.scrollToVideo(id)
  }, [])

  function showPlace(place: NearbyPlace) {
    setSelectedPlace({ ...place })
    document.getElementById('map')?.scrollIntoView({ block: 'start' })
  }

  // 検索条件の変更時に、地図の選択をリセットする。
  function chooseMode(mode: TravelMode) {
    setMode(mode)
    setSelectedPlace(null)
  }

  function chooseDemo(index: number) {
    request.current++
    setOrigin(demoLocations[index])
    setLoading(false)
    setNotice('')
    setSelectedPlace(null)
  }

  // 取得中も動画を表示し、失敗した場合はデモ地点で続けられるようにする。
  const locate = useCallback(() => {
    // 以前の要求を無効にして、取得中の表示へ切り替える。
    const id = ++request.current
    setLoading(true)
    setNotice('')
    setSelectedPlace(null)

    // デモ地点へ切り替えた後に届く失敗は表示しない。
    const fail = () => {
      if (request.current !== id) return
      setOrigin(demoLocations[0])
      setLoading(false)
      setNotice('現在地を取得できなかったため、デモを表示しています。')
    }
    if (!navigator.geolocation) {
      fail()
      return
    }

    // 最新の要求が成功したときだけ、現在地で検索する。
    navigator.geolocation.getCurrentPosition(position => {
      if (request.current !== id) return
      setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude, label: 'あなたの現在地', demo: false })
      setLoading(false)
    }, fail,
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }, [])

  useEffect(() => {
    locate()
    return () => { request.current++ }
  }, [locate])

  // 地図と段階的に読み込む動画一覧を、同じページに続けて表示する。
  return <>
    <aside className="desktop-brand" aria-hidden="true">
      <RouteIcon size={64} strokeWidth={1.5} />
      <p>よりみち</p><span>動画のつづきは、街で。</span>
      <small>YOUR NEXT LITTLE ADVENTURE</small>
    </aside>
    <div className="app-shell">
      <header className="header">
        <a href="/" className="brand" aria-label="よりみち ホーム"><RouteIcon className="brand-icon" size={28} strokeWidth={2.5} />よりみち</a>
        <nav className="header-links" aria-label="ページ内ナビゲーション">
          <a href="#map" aria-label="近くの地図へ"><Map size={19} /></a>
          <a href="#videos" aria-label="動画一覧へ"><Play size={18} /></a>
        </nav>
      </header>
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">近くの場所が登場する、<br /><span>ニコニコ動画を探そう。</span></h1>
        </section>

        <div className="page-content">
          <section className="location-box" aria-label="検索地点">
            <label className="location-select"><MapPin size={18} />
              <select aria-label="検索地点" value={origin.demo ? demoLocations.indexOf(origin) : ''} onChange={event => chooseDemo(Number(event.target.value))}>
                <option value="" disabled>あなたの現在地</option>
                {demoLocations.map((location, index) => <option key={location.label} value={index}>デモ：{location.label}</option>)}
              </select>
            </label>
            <button className="current-button" onClick={locate} disabled={loading} aria-label="現在地を取得する"><LocateFixed size={16} />{loading ? '取得中…' : '現在地'}</button>
            {(loading || notice) && <p className="location-status" role="status">{loading ? '現在地を確認しています…' : notice}</p>}
          </section>

          <section id="map" className="map-section" aria-labelledby="map-title">
            <div className="section-heading"><h2 id="map-title">近くのよりみちマップ</h2><span>{placeCount} 地点</span></div>
            <NearbyMap origin={origin} radius={radius} videos={videos} selectedPlace={selectedPlace} onChooseVideo={chooseVideo} />
          </section>

          <section id="videos" aria-labelledby="results-title" aria-busy={loading}>
            <div className="results-header">
              <div><h2 id="results-title">近くで出会える動画</h2><p>近い順・直線距離</p></div>
              <span className="result-count"><strong>{videos.length}</strong> 本</span>
            </div>
            <VideoFeed key={`${origin.latitude},${origin.longitude},${radius}`} ref={feed} videos={videos} origin={origin} mode={mode} onShowPlace={showPlace} />
            {videos.length === 0 && <div className="empty">
              <Compass size={34} strokeWidth={1.4} />
              <h3>この範囲には、まだ動画がありません</h3>
              <p>関東周辺の動画を収録しています。移動範囲を広げるか、別のデモ地点で探してみてください。</p>
              <button className="current-button" onClick={() => mode === 'walking' ? chooseMode('driving') : chooseDemo(0)}>{mode === 'walking' ? '車の範囲で探す' : '上野駅から探す'}<ArrowUpRight size={16} /></button>
            </div>}
          </section>
          <aside className="about">
            <p>半径 {radius} km の登録地点を検索しています。距離は直線距離です。移動時間は経路検索で確認できます。</p>
            <p>地図をたどって旅に出よう。データの出典：<a href={data.source} target="_blank" rel="noreferrer">ニコニコ「動画旅マップ」<ArrowUpRight size={11} /></a></p>
            <p>関東周辺の {data.videos.length} 本・{data.places.length} 地点を収録（{data.importedAt} 取得）。<br />掲載地点は元マップの座標です。営業状況・立ち入り可否は訪問前にご確認ください。</p>
            <p>地点名の補足：Google マップ</p>
          </aside>
        </div>
      </main>
      <footer className="footer"><span>よりみち / 2026.10 HACKATHON</span><span>いつもの街に、知らなかったつづきを。</span></footer>
    </div>
    <div className="travel-toggle" role="group" aria-label="移動手段と検索範囲">
      <button aria-pressed={mode === 'walking'} onClick={() => chooseMode('walking')}><Footprints size={19} />徒歩<span>1 km</span></button>
      <button aria-pressed={mode === 'driving'} onClick={() => chooseMode('driving')}><Car size={19} />車<span>10 km</span></button>
    </div>
  </>
}

const demoLocations: Origin[] = [
  { label: '上野駅', latitude: 35.7138, longitude: 139.7773, demo: true },
  { label: '浅草駅', latitude: 35.7119, longitude: 139.7984, demo: true },
  { label: '東京駅', latitude: 35.6812, longitude: 139.7671, demo: true },
  { label: '横浜駅', latitude: 35.4658, longitude: 139.6223, demo: true },
  { label: '鎌倉駅', latitude: 35.3192, longitude: 139.5503, demo: true },
]
