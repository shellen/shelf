// ABOUTME: Builds the shelf rail's tabs: the showcase groups, one per medium, and All.
// ABOUTME: Also names an item's medium, counts things, and formats its caption state line and star rating as text.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const READING_TAG = 'currently-reading'

export const mediumOf = b => b.medium || 'book'
// A medium's label for one item: "Books" names a "Book"
export const singular = label => label.slice(0, -1)
// "1 album", "380 albums"
export const counted = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`
const isReading = b => (b.tags || []).includes(READING_TAG)
const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '')

// Newest first; items without the date go last; ties break by title
const newestFirst = key => (a, b) => {
  const x = a[key] || null
  const y = b[key] || null
  if (x && y && x !== y) return x < y ? 1 : -1
  if (!x !== !y) return x ? -1 : 1
  return byTitle(a, b)
}

// The shelf rail's tabs: the showcase groups that have items, then a tab per medium present
// (in `media` order), then All. Medium tabs and All hold every item, in title order.
export function shelfTabs(books, media) {
  if (!books.length) return []
  const showcase = [
    { key: 'reading', label: 'Reading', items: books.filter(isReading).sort(newestFirst('dateAdded')) },
    { key: 'favorites', label: 'Favorites', items: books.filter(b => b.rating === 5).sort(newestFirst('dateRead')).slice(0, 30) },
    { key: 'finished', label: 'Recently finished', items: books.filter(b => b.dateRead).sort(newestFirst('dateRead')).slice(0, 20) },
  ]
  const byMedium = media.map(m => ({ key: m.key, label: m.label, medium: m.key, items: books.filter(b => mediumOf(b) === m.key).sort(byTitle) }))
  return [
    ...showcase,
    ...byMedium,
    { key: 'all', label: 'All', items: [...books].sort(byTitle) },
  ].filter(t => t.items.length)
}

export function captionState(book) {
  if (isReading(book)) return 'Reading'
  if (!book.dateRead) return ''
  const [year, month] = String(book.dateRead).split('-')
  return month ? `Read ${MONTHS[Number(month) - 1]} ${year}` : `Read ${year}`
}

export function starText(rating) {
  if (!rating) return ''
  return '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '')
}
