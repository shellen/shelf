// ABOUTME: Chooses which library items the shelf view showcases, grouped for its tab rail.
// ABOUTME: Also names an item's medium and formats its caption state line and star rating as text.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const READING_TAG = 'currently-reading'

export const mediumOf = b => b.medium || 'book'
// A medium's label for one item: "Books" names a "Book"
export const singular = label => label.slice(0, -1)
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

export function showcaseGroups(books, { landing = [], medium = '' } = {}) {
  const pool = books.filter(b => medium ? mediumOf(b) === medium : landing.includes(mediumOf(b)))
  const groups = [
    { key: 'reading', label: 'Reading', items: pool.filter(isReading).sort(newestFirst('dateAdded')) },
    { key: 'favorites', label: 'Favorites', items: pool.filter(b => b.rating === 5).sort(newestFirst('dateRead')).slice(0, 30) },
    { key: 'finished', label: 'Recently finished', items: pool.filter(b => b.dateRead).sort(newestFirst('dateRead')).slice(0, 20) },
  ].filter(g => g.items.length)
  if (!groups.length && pool.length) {
    groups.push({ key: 'shelf', label: 'On the shelf', items: [...pool].sort(byTitle).slice(0, 30) })
  }
  return groups
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
