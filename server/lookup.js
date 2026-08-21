// ABOUTME: iTunes Search API integration for non-book media metadata:
// ABOUTME: query building and result mapping (title, creator, year, artwork URL).

const ITUNES_PARAMS = {
  audiobook: { media: 'audiobook' },
  movie: { media: 'movie', entity: 'movie' },
  podcast: { media: 'podcast' },
  album: { media: 'music', entity: 'album' }
}

export function itunesUrl(medium, term) {
  const params = ITUNES_PARAMS[medium]
  if (!params) return null
  const qs = new URLSearchParams({ term, limit: '10', ...params })
  return `https://itunes.apple.com/search?${qs}`
}

export function mapItunesResults(medium, results) {
  return (results || []).flatMap(r => {
    const title = (medium === 'album' ? r.collectionName : r.trackName || r.collectionName || '').trim()
    if (!title) return []
    const yearMatch = String(r.releaseDate || '').match(/^(\d{4})/)
    return [{
      title,
      author: r.artistName || null,
      year: yearMatch ? Number(yearMatch[1]) : null,
      coverUrl: r.artworkUrl100 ? r.artworkUrl100.replace('100x100', '600x600') : null
    }]
  })
}

export async function searchItunes(medium, term) {
  const url = itunesUrl(medium, term)
  if (!url) return null
  const res = await fetch(url)
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`)
  const data = await res.json()
  return mapItunesResults(medium, data.results)
}
