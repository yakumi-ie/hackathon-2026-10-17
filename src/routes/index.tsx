import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Car, Compass, Footprints, LocateFixed, MapPin, Navigation, Play, Route as RouteIcon } from 'lucide-react'
import { css } from '../../styled-system/css'
import data from '../data.json'
import { directionsUrl, findNearbyVideos } from '../nearby'
import type { Coordinates, NearbyVideo } from '../nearby'

type Origin = Coordinates & { label: string; demo: boolean }
type TravelMode = 'walking' | 'driving'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const [origin, setOrigin] = useState<Origin | null>(demoLocations[0])
  const [mode, setMode] = useState<TravelMode>('walking')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(12)
  const request = useRef(0)
  const radius = mode === 'walking' ? 1 : 10
  const videos = useMemo(() => origin ? findNearbyVideos(origin, radius) : [], [origin, radius])

  function chooseDemo(index: number) {
    request.current++
    setOrigin(demoLocations[index])
    setLoading(false)
    setError('')
    setLimit(12)
  }

  function locate() {
    // 以前の要求を無効にして、取得中の表示へ切り替える。
    const id = ++request.current
    setOrigin(null)
    setLoading(true)
    setError('')
    setLimit(12)

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

  return <>
    <header className="header">
      <a href="/" className="brand" aria-label="よりみち ホーム"><RouteIcon className="brand-icon" size={28} strokeWidth={2.5} />よりみち</a>
      <span className="header-note">動画から、街へ。</span>
    </header>
    <main className={css({ maxWidth: '800px', margin: 'auto', padding: { base: '0 20px', md: '0 28px' } })}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="eyebrow"><span>●</span> FIND YOUR NEXT LITTLE ADVENTURE</div>
        <h1 id="hero-title">動画のつづきは、<br /><span>街で。</span></h1>
        <p className="hero-description">画面の向こうの景色も、ごはんも。<br />近くの動画から、今日のよりみちを見つけよう。</p>
        <div className="hero-path" aria-hidden="true"><MapPin size={32} strokeWidth={1.5} /></div>
      </section>

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
            <button aria-pressed={mode === 'walking'} onClick={() => { setMode('walking'); setLimit(12) }}><Footprints size={17} />徒歩<span>1 km</span></button>
            <button aria-pressed={mode === 'driving'} onClick={() => { setMode('driving'); setLimit(12) }}><Car size={17} />車<span>10 km</span></button>
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

      <section aria-labelledby="results-title" aria-busy={loading}>
        <div className="results-header">
          <h2 id="results-title">近くで出会える動画<small>{videos.length} 本</small></h2>
          <span className="sort-label">近い順</span>
        </div>
        <div className={css({ display: 'grid', gap: '16px' })}>
          {origin && videos.slice(0, limit).map((video, index) => <VideoCard key={video.id} video={video} origin={origin} mode={mode} index={index} />)}
        </div>
        {videos.length > limit && <button className="load-more" onClick={() => setLimit(limit + 12)}>もっと見る（残り {videos.length - limit} 本）</button>}
        {videos.length === 0 && <div className="empty">
          <Compass size={34} strokeWidth={1.4} />
          <h3>{loading ? 'あなたの近くのよりみちを探す準備中' : origin ? 'この範囲には、まだ動画がありません' : '探す場所を選んでみよう'}</h3>
          <p>{loading ? 'ブラウザに位置情報の許可を求める画面が出たら、許可してください。' : origin ? '関東周辺の動画を収録しています。移動範囲を広げるか、別のデモ地点で探してみてください。' : '現在地を使うか、デモ地点を選ぶと、近くの動画が見つかります。'}</p>
          {!loading && <button className="current-button" onClick={() => origin && mode === 'walking' ? setMode('driving') : chooseDemo(0)}>{origin && mode === 'walking' ? '車の範囲で探す' : '上野駅から探す'}<ArrowUpRight size={16} /></button>}
        </div>}
      </section>
      <aside className="about">
        <p>地図をたどって旅に出よう。データの出典：<a href={data.source} target="_blank" rel="noreferrer">ニコニコ「動画旅マップ」<ArrowUpRight size={11} className={css({ display: 'inline' })} /></a></p>
        <p>関東周辺の {data.videos.length} 本・{data.places.length} 地点を収録（{data.importedAt} 取得）。<br />掲載地点は元マップの座標です。営業状況・立ち入り可否は訪問前にご確認ください。</p>
      </aside>
    </main>
    <footer className="footer"><span>よりみち / 2026.10 HACKATHON</span><span>いつもの街に、知らなかったつづきを。</span></footer>
  </>
}

function VideoCard({ video, origin, mode, index }: { video: NearbyVideo; origin: Coordinates; mode: TravelMode; index: number }) {
  const nearest = video.places[0]
  return <article className="video-card">
    <a className="poster" href={video.url} target="_blank" rel="noreferrer" aria-label={`${video.title}をニコニコ動画で見る`}>
      <MapPin size={58} strokeWidth={1} aria-hidden="true" />
      {video.thumbnail && <Thumbnail key={video.thumbnail} url={video.thumbnail} />}
      <span className="play-icon"><Play size={19} fill="currentColor" aria-hidden="true" /></span>
      <span className="poster-label">ニコニコ動画</span>
    </a>
    <div className="card-content">
      <div className="card-meta"><span className="video-number">YORIMICHI / {String(index + 1).padStart(2, '0')}</span><span className="distance"><MapPin size={12} />{formatDistance(nearest.distance)}</span></div>
      <h3>{video.title}</h3>
      <p className="author">{video.author}</p>
      <div className="card-actions">
        <a className="video-link" href={video.url} target="_blank" rel="noreferrer"><Play size={13} />動画を見る<ArrowUpRight size={13} /></a>
        <a className="directions-link" href={directionsUrl(origin, nearest, mode)} target="_blank" rel="noreferrer"><Navigation size={14} />掲載地点への経路<ArrowUpRight size={13} /></a>
      </div>
      {video.places.length > 1 && <details className="other-places"><summary>この範囲に、ほか {video.places.length - 1} 地点</summary>
        {video.places.slice(1).map((place, index) => <a key={place.id} href={directionsUrl(origin, place, mode)} target="_blank" rel="noreferrer"><span>登録地点 {index + 2} · {formatDistance(place.distance)}</span><span>経路を見る ↗</span></a>)}
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
