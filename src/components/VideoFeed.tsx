import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import { ArrowDown, ArrowUpRight, Map, MapPin, Navigation, Play } from 'lucide-react'
import { directionsUrl } from '../nearby'
import type { Coordinates, NearbyPlace, NearbyVideo } from '../nearby'

export type VideoFeedHandle = { scrollToVideo: (id: string) => void }
type TravelMode = 'walking' | 'driving'
type Props = {
  videos: NearbyVideo[]
  origin: Coordinates
  mode: TravelMode
  onShowPlace: (place: NearbyPlace) => void
  ref: Ref<VideoFeedHandle>
}

export function VideoFeed({ videos, origin, mode, onShowPlace, ref }: Props) {
  const [count, setCount] = useState(batchSize)
  const [target, setTarget] = useState<string | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const visible = videos.slice(0, count)
  const hasMore = visible.length < videos.length

  // 地図で選ばれた動画まで描画し、次の描画後にカードへ移動する。
  useImperativeHandle(ref, () => ({
    scrollToVideo(id) {
      const index = videos.findIndex(video => video.id === id)
      if (index < 0) return
      setCount(count => Math.max(count, index + 1))
      setTarget(id)
    },
  }), [videos])
  useEffect(() => {
    if (!target) return
    const card = document.getElementById(`video-${target}`)
    card?.focus({ preventScroll: true })
    card?.scrollIntoView({ block: 'start' })
    setTarget(null)
  }, [target])

  // 一覧の末尾が近づいたら、次のまとまりを追加する。
  useEffect(() => {
    if (!sentinel.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setCount(count => Math.min(count + batchSize, videos.length))
    }, { rootMargin: '400px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [count, videos.length])

  // キーボードでも追加できるよう、手動操作と表示件数を用意する。
  return <>
    <div className="video-feed">
      {visible.map((video, index) => <VideoCard key={video.id} video={video} origin={origin} mode={mode} index={index} onShowPlace={onShowPlace} />)}
    </div>
    {videos.length > 0 && <p className="feed-status" role="status">{visible.length} / {videos.length} 本を表示{hasMore ? '' : '・すべて表示しました'}</p>}
    {hasMore && <div ref={sentinel} className="feed-more">
      <button onClick={() => setCount(count => Math.min(count + batchSize, videos.length))}>さらに動画を見る<ArrowDown size={16} /></button>
    </div>}
  </>
}

function VideoCard({ video, origin, mode, index, onShowPlace }: { video: NearbyVideo; origin: Coordinates; mode: TravelMode; index: number; onShowPlace: (place: NearbyPlace) => void }) {
  const nearest = video.places[0]
  return <article id={`video-${video.id}`} className="video-card" tabIndex={-1} aria-labelledby={`title-${video.id}`}>
    <a className="poster" href={video.url} target="_blank" rel="noreferrer" aria-label={`${video.title}をニコニコ動画で見る`}>
      <div className="poster-fallback"><MapPin size={46} strokeWidth={1.5} aria-hidden="true" /><span>この動画の景色を見に行こう</span></div>
      {video.thumbnail && <Thumbnail key={video.thumbnail} url={video.thumbnail} />}
      <span className="play-icon"><Play size={19} fill="currentColor" aria-hidden="true" /></span>
      <span className="poster-label">{nearest.name} · {formatDistance(nearest.distance)}</span>
      <span className="poster-number">{String(index + 1).padStart(2, '0')}</span>
    </a>
    <div className="card-content">
      <div className="card-meta"><p className="card-place"><MapPin size={14} /><span>{nearest.name}</span></p><span className="distance">{formatDistance(nearest.distance)}</span></div>
      <h3 id={`title-${video.id}`}>{video.title}</h3>
      <p className="author">{video.author}</p>
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

const batchSize = 8
