import data from './data.json'

export type Coordinates = { latitude: number; longitude: number }
export type Video = (typeof data.videos)[number]
export type NearbyPlace = (typeof data.places)[number] & { distance: number }
export type NearbyVideo = Video & { places: NearbyPlace[] }

export function findNearbyVideos(origin: Coordinates, radius: number): NearbyVideo[] {
  const grouped = new Map<string, NearbyPlace[]>()
  for (const place of data.places) {
    const distance = distanceKm(origin, place)
    if (distance > radius) continue
    const places = grouped.get(place.videoId) ?? []
    places.push({ ...place, distance })
    grouped.set(place.videoId, places)
  }
  return data.videos.flatMap(video => {
    const places = grouped.get(video.id)
    return places ? [{ ...video, places: places.sort((a, b) => a.distance - b.distance) }] : []
  }).sort((a, b) => a.places[0].distance - b.places[0].distance)
}

export function directionsUrl(origin: Coordinates, destination: Coordinates, mode: 'walking' | 'driving') {
  const query = new URLSearchParams({
    api: '1', origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`, travelmode: mode,
  })
  return `https://www.google.com/maps/dir/?${query}`
}

function distanceKm(a: Coordinates, b: Coordinates) {
  const radians = (n: number) => n * Math.PI / 180
  const latitude = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
  const longitude = Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude))
    * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(latitude + longitude)))
}
