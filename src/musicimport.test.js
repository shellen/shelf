// ABOUTME: Tests for the music library readers (Spotify's YourLibrary.json, Apple Music's Library.xml)
// ABOUTME: and for telling an import file's type from its contents.

import { describe, it, expect } from 'vitest'
import { parseSpotifyLibrary } from './musicimport.js'

// The fields every import entry carries, as parseGoodreadsCsv's entries do
const BLANK = { isbn: null, rating: null, notes: null, dateRead: null, dateAdded: null, pages: null, year: null }

describe('parseSpotifyLibrary', () => {
  const spotify = data => parseSpotifyLibrary(JSON.stringify(data))

  it('makes an album of each saved album, tagged with its source', () => {
    const { books, failed } = spotify({
      albums: [{ artist: 'Radiohead', album: 'In Rainbows', uri: 'spotify:album:1' }]
    })
    expect(books).toEqual([
      { ...BLANK, title: 'In Rainbows', author: 'Radiohead', medium: 'album', tags: ['spotify'] }
    ])
    expect(failed).toEqual([])
  })

  it('makes an album of each liked song\'s album, so a liked single becomes an album', () => {
    const { books } = spotify({
      tracks: [{ artist: 'Robyn', album: 'Dancing On My Own', track: 'Dancing On My Own', uri: 'spotify:track:1' }]
    })
    expect(books.map(b => [b.title, b.author, b.medium])).toEqual([['Dancing On My Own', 'Robyn', 'album']])
  })

  it('lists an album once however it is spelled across saved albums and liked songs', () => {
    const { books } = spotify({
      albums: [{ artist: 'Björk', album: 'Homogenic', uri: 'spotify:album:2' }],
      tracks: [
        { artist: 'Bjork', album: 'Homogenic', track: 'Jóga', uri: 'spotify:track:2' },
        { artist: 'björk', album: 'HOMOGENIC!', track: 'Bachelorette', uri: 'spotify:track:3' }
      ]
    })
    expect(books.map(b => [b.title, b.author])).toEqual([['Homogenic', 'Björk']])
  })

  it('keeps albums of the same name by different artists apart', () => {
    const { books } = spotify({
      albums: [
        { artist: 'Weezer', album: 'Weezer', uri: 'spotify:album:3' },
        { artist: 'Peter Gabriel', album: 'Weezer', uri: 'spotify:album:4' }
      ]
    })
    expect(books).toHaveLength(2)
  })

  it('makes a podcast of each followed show, with its publisher as the creator', () => {
    const { books } = spotify({
      shows: [{ name: 'Radiolab', publisher: 'WNYC Studios', uri: 'spotify:show:1' }]
    })
    expect(books).toEqual([
      { ...BLANK, title: 'Radiolab', author: 'WNYC Studios', medium: 'podcast', tags: ['spotify'] }
    ])
  })

  it('skips records with no album or show name', () => {
    const { books } = spotify({
      albums: [{ artist: 'Nobody', album: '  ', uri: 'spotify:album:5' }],
      tracks: [{ artist: 'Nobody', track: 'Untitled', uri: 'spotify:track:4' }],
      shows: [{ publisher: 'Nobody', uri: 'spotify:show:2' }]
    })
    expect(books).toEqual([])
  })

  it('treats a missing or malformed section as empty', () => {
    expect(spotify({})).toEqual({ books: [], failed: [] })
    expect(spotify({ albums: 'x', tracks: null, shows: {} })).toEqual({ books: [], failed: [] })
  })

  it('leaves the creator blank when a record names none', () => {
    const { books } = spotify({ albums: [{ album: 'Untitled', uri: 'spotify:album:6' }] })
    expect(books).toEqual([{ ...BLANK, title: 'Untitled', author: null, medium: 'album', tags: ['spotify'] }])
  })

  it('ignores the arrays it does not import', () => {
    const { books } = spotify({
      albums: [{ artist: 'Radiohead', album: 'In Rainbows', uri: 'spotify:album:1' }],
      episodes: [{ name: 'Episode 1', show: 'Radiolab' }],
      bannedTracks: [{ artist: 'X', album: 'Y', track: 'Z' }],
      other: ['anything']
    })
    expect(books.map(b => b.title)).toEqual(['In Rainbows'])
  })
})
