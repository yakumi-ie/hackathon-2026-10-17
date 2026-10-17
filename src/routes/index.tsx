import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUpRight, Car, Compass, Footprints, LocateFixed, Map, MapPin, Navigation, Play, Route as RouteIcon } from 'lucide-react'
import { NearbyMap } from '../components/NearbyMap'
import data from '../data.json'
import { directionsUrl, findNearbyVideos } from '../nearby'
import type { Coordinates, NearbyPlace, NearbyVideo } from '../nearby'

type Origin = Coordinates & { label: string; demo: boolean }
type TravelMode = 'walking' | 'driving'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  // 検索条件と位置情報の取得状態を保持する。
  const [origin, setOrigin] = useState<Origin | null>(demoLocations[0])
  const [mode, setMode] = useState<TravelMode>('walking')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPlace, setSelectedPlace] = useState<NearbyPlace | null>(null)
  const request = useRef(0)
  const radius = mode === 'walking' ? 1 : 10
  const videos = useMemo(() => origin ? findNearbyVideos(origin, radius) : [], [origin, radius])
  const placeCount = videos.reduce((count, video) => count + video.places.length, 0)

  // ピンとカードの移動を、ページ内のスクロールでつなぐ。
  const chooseVideo = useCallback((id: string) => {
    const card = document.getElementById(`video-${id}`)
    card?.focus({ preventScroll: true })
    card?.scrollIntoView({ block: 'start' })
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
    setError('')
    setSelectedPlace(null)
  }

  // 操作されたときだけ現在地を取得する。
  function locate() {
    // 以前の要求を無効にして、取得中の表示へ切り替える。
    const id = ++request.current
    setOrigin(null)
    setLoading(true)
    setError('')
    setSelectedPlace(null)

    // デモ地点へ切り替えた後に届く失敗は表示しない。
    const fail = (message: string) => {
      if (request.current !== id) return
      setLoading(false)
      setError(message)
    }
    if (!navigator.geolocation) {
      fail('このブラウザでは現在地を取得できません。デモ地点を選んでお試しください。')
      return
    }

    // 最新の要求が成功したときだけ、現在地で検索する。
    navigator.geolocation.getCurrentPosition(position => {
      if (request.current !== id) return
      setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude, label: 'あなたの現在地', demo: false })
      setLoading(false)
    }, error => fail(error.code === 1
      ? '位置情報の利用が許可されていません。ブラウザの設定を確認するか、デモ地点を選んでください。'
      : '現在地を取得できませんでした。もう一度試すか、デモ地点を選んでください。'),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }

  // 地図と全件の動画一覧を、同じページに続けて表示する。
  return <>
    <aside className="desktop-brand" aria-hidden="true">
      <RouteIcon size={64} strokeWidth={1.5} />
      <p>よりみち</p><span>動画のつづきは、街で。</span>
      <small>YOUR NEXT LITTLE ADVENTURE</small>
    </aside>
    <div className="app-shell">
      <header className="header">
        <a href="/" className="brand" aria-label="よりみち ホーム"><RouteIcon className="brand-icon" size={28} strokeWidth={2.5} />よりみち</a>
        <a href="#map" className="header-map" aria-label="近くの地図へ"><Map size={20} /></a>
      </header>
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="eyebrow">さあ、今日のよりみちへ。</div>
          <h1 id="hero-title">動画のつづきは、<br /><span>街で。</span></h1>
          <p className="hero-description">画面の向こうの景色も、ごはんも。<br />近くの動画から、行ってみたい場所を見つけよう。</p>
          <div className="hero-art" aria-hidden="true"><span><Play size={23} fill="currentColor" /></span><i /><span><Footprints size={25} /></span><i /><span><MapPin size={25} /></span></div>
        </section>

        <div className="page-content">
          <section className="location-box" aria-label="検索する場所と移動手段">
            <div className="location-row">
              <div className="location-label">
                <span className="location-icon"><MapPin size={19} /></span>
                <div><span className="small-label">{origin?.demo ? 'デモ地点' : 'ここから探す'}</span>
                  <p className="location-name" role="status">{loading ? '現在地を取得しています…' : origin?.label ?? '場所を選んでください'}</p>
                </div>
              </div>
              <button className="current-button" onClick={locate} disabled={loading}><LocateFixed size={16} />{loading ? '取得中…' : '現在地を使う'}</button>
            </div>
            <div className="controls">
              <div className="travel-toggle" role="group" aria-label="移動手段">
                <button aria-pressed={mode === 'walking'} onClick={() => chooseMode('walking')}><Footprints size={17} />徒歩<span>1 km</span></button>
                <button aria-pressed={mode === 'driving'} onClick={() => chooseMode('driving')}><Car size={17} />車<span>10 km</span></button>
              </div>
              <label className="demo-select">デモ地点
                <select aria-label="デモ地点" value={origin?.demo ? demoLocations.indexOf(origin) : ''} onChange={event => chooseDemo(Number(event.target.value))}>
                  <option value="" disabled>地点を選択</option>
                  {demoLocations.map((location, index) => <option key={location.label} value={index}>{location.label}</option>)}
                </select>
              </label>
            </div>
            <p className="range-note">半径 {radius} km の登録地点を検索。距離は直線距離です。移動時間は経路検索で確認できます。</p>
            {error && <p className="error-message" role="alert">{error}</p>}
          </section>

          <section id="map" className="map-section" aria-labelledby="map-title">
            <div className="section-heading"><span className="section-label">NEARBY MAP</span><h2 id="map-title">近くのよりみちマップ</h2><p>見つかった動画の {placeCount} 地点だけを表示。</p></div>
            {origin ? <NearbyMap origin={origin} radius={radius} videos={videos} selectedPlace={selectedPlace} onChooseVideo={chooseVideo} />
              : <div className="map-placeholder"><Map size={32} /><p>{loading ? '現在地を取得しています…' : '場所を選ぶと地図を表示します'}</p></div>}
            <div className="map-legend"><span><i />検索の中心</span><span><b>1</b>動画と共通の番号</span><span><b>1+</b>同じ地点に複数の動画</span><span><b className="cluster-legend">3</b>近いピンの数・選ぶと拡大</span></div>
            <a className="feed-jump" href="#videos">動画をスクロールして探す<ArrowDown size={17} /></a>
          </section>

          <section id="videos" aria-labelledby="results-title" aria-busy={loading}>
            <div className="results-header">
              <div><span className="section-label">VIDEO PICKS</span><h2 id="results-title">近くで出会える動画</h2></div>
              <span className="result-count"><strong>{videos.length}</strong> 本<span>近い順</span></span>
            </div>
            <div className="video-feed">
              {origin && videos.map((video, index) => <VideoCard key={video.id} video={video} origin={origin} mode={mode} index={index} onShowPlace={showPlace} />)}
            </div>
            {videos.length === 0 && <div className="empty">
              <Compass size={34} strokeWidth={1.4} />
              <h3>{loading ? 'あなたの近くのよりみちを探す準備中' : origin ? 'この範囲には、まだ動画がありません' : '探す場所を選んでみよう'}</h3>
              <p>{loading ? 'ブラウザに位置情報の許可を求める画面が出たら、許可してください。' : origin ? '関東周辺の動画を収録しています。移動範囲を広げるか、別のデモ地点で探してみてください。' : '現在地を使うか、デモ地点を選ぶと、近くの動画が見つかります。'}</p>
              {!loading && <button className="current-button" onClick={() => origin && mode === 'walking' ? chooseMode('driving') : chooseDemo(0)}>{origin && mode === 'walking' ? '車の範囲で探す' : '上野駅から探す'}<ArrowUpRight size={16} /></button>}
            </div>}
          </section>
          <aside className="about">
            <p>地図をたどって旅に出よう。データの出典：<a href={data.source} target="_blank" rel="noreferrer">ニコニコ「動画旅マップ」<ArrowUpRight size={11} /></a></p>
            <p>関東周辺の {data.videos.length} 本・{data.places.length} 地点を収録（{data.importedAt} 取得）。<br />掲載地点は元マップの座標です。営業状況・立ち入り可否は訪問前にご確認ください。</p>
            <p>地点名の補足：Google マップ</p>
          </aside>
        </div>
      </main>
      <footer className="footer"><span>よりみち / 2026.10 HACKATHON</span><span>いつもの街に、知らなかったつづきを。</span></footer>
    </div>
    <nav className="jump-nav" aria-label="ページ内ナビゲーション">
      <span className="nav-caption">今日のよりみちを探す</span>
      <a href="#map"><Map size={20} /><span>地図を見る</span></a>
      <a href="#videos"><Play size={19} /><span>動画を眺める</span><b>{videos.length}</b></a>
    </nav>
  </>
}

function VideoCard({ video, origin, mode, index, onShowPlace }: { video: NearbyVideo; origin: Coordinates; mode: TravelMode; index: number; onShowPlace: (place: NearbyPlace) => void }) {
  const nearest = video.places[0]
  return <article id={`video-${video.id}`} className="video-card" tabIndex={-1} aria-labelledby={`title-${video.id}`}>
    <a className="poster" href={video.url} target="_blank" rel="noreferrer" aria-label={`${video.title}をニコニコ動画で見る`}>
      <div className="poster-fallback"><MapPin size={46} strokeWidth={1.5} aria-hidden="true" /><span>この動画の景色を見に行こう</span></div>
      {video.thumbnail && <Thumbnail key={video.thumbnail} url={video.thumbnail} />}
      <span className="play-icon"><Play size={19} fill="currentColor" aria-hidden="true" /></span>
      <span className="poster-label">ニコニコ動画</span>
      <span className="poster-number">{String(index + 1).padStart(2, '0')}</span>
    </a>
    <div className="card-content">
      <div className="card-meta"><span className="video-number">YORIMICHI / {String(index + 1).padStart(2, '0')}</span><span className="distance"><MapPin size={12} />{formatDistance(nearest.distance)}</span></div>
      <h3 id={`title-${video.id}`}>{video.title}</h3>
      <p className="author">{video.author}</p>
      <p className="card-place"><MapPin size={14} /><span>{nearest.name}</span></p>
      <div className="card-actions">
        <a className="video-link" href={video.url} target="_blank" rel="noreferrer"><Play size={13} />動画を見る<ArrowUpRight size={13} /></a>
        <button className="map-link" onClick={() => onShowPlace(nearest)}><Map size={15} />地図で見る</button>
        <a className="directions-link" href={directionsUrl(origin, nearest, mode)} target="_blank" rel="noreferrer"><Navigation size={14} />掲載地点への経路<ArrowUpRight size={13} /></a>
      </div>
      {video.places.length > 1 && <details className="other-places"><summary>この範囲に、ほか {video.places.length - 1} 地点</summary>
        {video.places.slice(1).map((place, index) => <div className="place-row" key={place.id}><span>{place.name}<small>地点 {index + 2} · {formatDistance(place.distance)}</small></span><div><button onClick={() => onShowPlace(place)} aria-label={`地点 ${index + 2} を地図で見る`}>地図</button><a href={directionsUrl(origin, place, mode)} target="_blank" rel="noreferrer" aria-label={`地点 ${index + 2} への経路を見る`}>経路 ↗</a></div></div>)}
      </details>}
    </div>
  </article>
}

function Thumbnail({ url }: { url: string }) {
  const image = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setLoaded(Boolean(image.current?.naturalWidth)) }, [])
  return <img ref={image} src={url} alt="" loading="lazy" referrerPolicy="no-referrer"
    style={{ visibility: loaded ? 'visible' : 'hidden' }} onLoad={() => setLoaded(true)} />
}

function formatDistance(km: number) {
  return km < 1 ? `約 ${Math.round(km * 100) * 10} m` : `約 ${km.toFixed(1)} km`
}

const demoLocations: Origin[] = [
  { label: '上野駅', latitude: 35.7138, longitude: 139.7773, demo: true },
  { label: '浅草駅', latitude: 35.7119, longitude: 139.7984, demo: true },
  { label: '東京駅', latitude: 35.6812, longitude: 139.7671, demo: true },
  { label: '横浜駅', latitude: 35.4658, longitude: 139.6223, demo: true },
  { label: '鎌倉駅', latitude: 35.3192, longitude: 139.5503, demo: true },
]
