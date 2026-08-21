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

export function mapOpenLibraryResults(docs) {
  return (docs || []).flatMap(d => {
    const title = (d.title || '').trim()
    if (!title) return []
    return [{
      title,
      author: d.author_name?.[0] || null,
      year: d.first_publish_year || null,
      isbn: d.isbn?.find(i => i.length === 13) || d.isbn?.[0] || null,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null
    }]
  })
}

export async function searchMedia(medium, term) {
  if (medium === 'book') {
    const qs = new URLSearchParams({ title: term, limit: '10', fields: 'title,author_name,first_publish_year,cover_i,isbn' })
    const res = await fetch(`https://openlibrary.org/search.json?${qs}`)
    if (!res.ok) throw new Error(`Open Library search failed: ${res.status}`)
    const data = await res.json()
    return mapOpenLibraryResults(data.docs)
  }
  const url = itunesUrl(medium, term)
  if (!url) return null
  const res = await fetch(url)
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`)
  const data = await res.json()
  return mapItunesResults(medium, data.results)
}
