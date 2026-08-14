// ABOUTME: Tests for Goodreads CSV row -> book mapping.
import { describe, it, expect } from 'vitest'
import { mapGoodreadsRow, parseGoodreadsCsv } from './goodreads.js'

const ROW = {
  'Title': 'Dune', 'Author': 'Frank Herbert',
  'ISBN': '="0441172717"', 'ISBN13': '="9780441172719"',
  'My Rating': '5', 'Number of Pages': '412',
  'Year Published': '1990', 'Original Publication Year': '1965',
  'Date Read': '2024/07/04', 'Date Added': '2023/01/02',
  'Bookshelves': 'sci-fi, classics', 'Exclusive Shelf': 'read',
  'My Review': 'Spice must flow.', 'Private Notes': 'Reread someday.'
}

describe('mapGoodreadsRow', () => {
  it('maps the full row', () => {
    expect(mapGoodreadsRow(ROW)).toEqual({
      title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719',
      rating: 5, notes: 'Spice must flow.\n\nReread someday.',
      tags: ['sci-fi', 'classics', 'read'],
      dateRead: '2024-07-04', dateAdded: '2023-01-02', pages: 412, year: 1965
    })
  })
  it('treats rating 0 as unrated', () => {
    expect(mapGoodreadsRow({ ...ROW, 'My Rating': '0' }).rating).toBeNull()
  })
  it('falls back to ISBN then null on empty armor', () => {
    expect(mapGoodreadsRow({ ...ROW, 'ISBN13': '=""' }).isbn).toBe('0441172717')
    expect(mapGoodreadsRow({ ...ROW, 'ISBN13': '=""', 'ISBN': '=""' }).isbn).toBeNull()
  })
  it('falls back to Year Published when no original year', () => {
    expect(mapGoodreadsRow({ ...ROW, 'Original Publication Year': '' }).year).toBe(1990)
  })
  it('returns null without a title', () => {
    expect(mapGoodreadsRow({ ...ROW, 'Title': ' ' })).toBeNull()
  })
})

describe('parseGoodreadsCsv', () => {
  it('collects books and 1-based failed row numbers', () => {
    const csv = 'Title,Author\nDune,Frank Herbert\n,Nobody\nFlow,Mihaly'
    const { books, failed } = parseGoodreadsCsv(csv)
    expect(books.map(b => b.title)).toEqual(['Dune', 'Flow'])
    expect(failed).toEqual([3])
  })
})
