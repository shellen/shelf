// ABOUTME: Tests for the music library readers (Spotify's YourLibrary.json, Apple Music's Library.xml)
// ABOUTME: and for telling an import file's type from its contents.

import { describe, it, expect } from 'vitest'
import { parseSpotifyLibrary, detectImportFile, parseAppleLibrary } from './musicimport.js'

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

describe('detectImportFile', () => {
  const PLIST_HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Major Version</key><integer>1</integer>
\t<key>Tracks</key>
\t<dict>`

  it('recognises an Apple Music library by its plist header and Tracks key', () => {
    expect(detectImportFile(`${PLIST_HEAD}</dict></dict></plist>`)).toBe('apple')
  })

  it('looks for the Apple header only in the first 4 KB', () => {
    expect(detectImportFile(`${' '.repeat(4096)}${PLIST_HEAD}</dict></dict></plist>`)).toBe(null)
  })

  it('does not take a plist without Tracks for a music library', () => {
    expect(detectImportFile('<?xml version="1.0"?><plist version="1.0"><dict><key>Name</key><string>x</string></dict></plist>')).toBe(null)
  })

  it('recognises a Spotify library by an albums, tracks or shows key, even when it is cut short', () => {
    expect(detectImportFile('{"albums": []}')).toBe('spotify')
    expect(detectImportFile('\n  {\n  "tracks" : [ {"artist": "Robyn", "album": "Body Ta')).toBe('spotify')
    expect(detectImportFile('{"other": [], "shows": []}')).toBe('spotify')
  })

  it('looks for Spotify\'s keys only in the first 4 KB', () => {
    expect(detectImportFile(`{"other": "${'x'.repeat(4096)}", "albums": []}`)).toBe(null)
  })

  it('recognises a Goodreads export by its Title column', () => {
    expect(detectImportFile('Book Id,Title,Author,My Rating\n1,Dune,Frank Herbert,5')).toBe('goodreads')
  })

  it('still recognises a plain Title,Author CSV as Goodreads', () => {
    expect(detectImportFile('Title,Author\nDune,Frank Herbert')).toBe('goodreads')
    expect(detectImportFile('"Title","Author"\r\n"Dune","Frank Herbert"')).toBe('goodreads')
  })

  it('returns null for unrelated XML, JSON and CSV', () => {
    expect(detectImportFile('<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>')).toBe(null)
    expect(detectImportFile('{"playlists": [], "name": "albums"}')).toBe(null)
    expect(detectImportFile('null')).toBe(null)
    expect(detectImportFile('[{"albums": []}]')).toBe(null)
    expect(detectImportFile('Name,Artist\nIn Rainbows,Radiohead')).toBe(null)
    expect(detectImportFile('')).toBe(null)
  })
})

// One track's <dict>, typed the way Music writes it: numbers as <integer>, true as <true/>,
// Date Added as <date>, everything else as <string>. A false flag is simply left out.
function plistTrack(fields) {
  const value = (key, v) => v === true ? '<true/>'
    : typeof v === 'number' ? `<integer>${v}</integer>`
    : key === 'Date Added' ? `<date>${v}</date>`
    : `<string>${v}</string>`
  return `<dict>${Object.entries(fields).map(([k, v]) => `<key>${k}</key>${value(k, v)}`).join('')}</dict>`
}

// A whole Library.xml holding these tracks, with an optional Playlists section after them
function appleLibrary(tracks, { playlists = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Major Version</key><integer>1</integer>
	<key>Application Version</key><string>1.5.0.73</string>
	<key>Tracks</key>
	<dict>
${tracks.map((t, i) => `		<key>${i + 1}</key>${plistTrack({ 'Track ID': i + 1, ...t })}`).join('\n')}
	</dict>
${playlists}</dict>
</plist>
`
}

const apple = tracks => parseAppleLibrary(appleLibrary(tracks)).books
const song = (fields = {}) => ({ Name: 'Song', Artist: 'Radiohead', Album: 'In Rainbows', ...fields })

describe('parseAppleLibrary', () => {
  it('groups tracks by normalised album and album artist, titled as the first track has it', () => {
    const books = apple([
      song({ Album: 'In Rainbows' }),
      song({ Album: 'IN RAINBOWS!' }),
      song({ Album: 'In Rainbows', Artist: 'Radiohead Tribute Band' })
    ])
    expect(books.map(b => [b.title, b.author])).toEqual([
      ['In Rainbows', 'Radiohead'],
      ['In Rainbows', 'Radiohead Tribute Band']
    ])
  })

  it('credits the album artist over the track artist', () => {
    const books = apple([
      song({ Album: 'Help!', Artist: 'Ringo Starr', 'Album Artist': 'The Beatles' }),
      song({ Album: 'Help!', Artist: 'John Lennon', 'Album Artist': 'The Beatles' })
    ])
    expect(books.map(b => [b.title, b.author])).toEqual([['Help!', 'The Beatles']])
  })

  it('credits a compilation without an album artist to Various Artists', () => {
    const books = apple([
      song({ Album: 'Pulp Fiction', Artist: 'Dick Dale', Compilation: true }),
      song({ Album: 'Pulp Fiction', Artist: 'Al Green', Compilation: true })
    ])
    expect(books.map(b => [b.title, b.author])).toEqual([['Pulp Fiction', 'Various Artists']])
  })

  it('credits the most common spelling of the album artist', () => {
    const books = apple([
      song({ Album: 'Homogenic', Artist: 'Bjork' }),
      song({ Album: 'Homogenic', Artist: 'Björk' }),
      song({ Album: 'Homogenic', Artist: 'Björk' })
    ])
    expect(books.map(b => b.author)).toEqual(['Björk'])
  })

  it('skips tracks with no album, playlist-only tracks, podcasts and video', () => {
    const books = apple([
      { Name: 'Loose Track', Artist: 'Radiohead' },
      song({ Album: 'Added To A Playlist', 'Playlist Only': true }),
      song({ Album: 'Serial', Podcast: true }),
      song({ Album: 'Some Film', Movie: true }),
      song({ Album: 'Some Show', 'TV Show': true }),
      song({ Album: 'Some Video', 'Music Video': true }),
      song({ Album: 'Video File', Kind: 'MPEG-4 video file' }),
      song({ Album: 'Purchased Video', Kind: 'Purchased MPEG-4 video file' }),
      song({ Album: 'Movie File', Kind: 'QuickTime movie file' }),
      song({ Album: 'Stream', Kind: 'HLS media' }),
      song({ Album: 'Kept' }),
      song({ Album: 'Kept Audio', Kind: 'AAC audio file' })
    ])
    expect(books.map(b => b.title)).toEqual(['Kept', 'Kept Audio'])
  })

  it('reads the tracks and ignores the Playlists section, even a malformed one', () => {
    const text = appleLibrary([song({ Album: 'Kept' })], {
      playlists: '\t<key>Playlists</key>\n\t<array><dict><key>Name</key><string>Unclosed\n'
    })
    expect(parseAppleLibrary(text).books.map(b => b.title)).toEqual(['Kept'])
  })

  it('throws on a file that is not well-formed', () => {
    const broken = appleLibrary([song()]).replace('</dict>\n</plist>', '')
    expect(() => parseAppleLibrary(broken)).toThrow('Library.xml is not well-formed')
  })

  it('makes one album entry from an album\'s tracks', () => {
    const { books, failed } = parseAppleLibrary(appleLibrary([
      song({ Name: '15 Step', Year: 2007, Genre: 'Alternative', 'Date Added': '2019-03-04T05:06:07Z' }),
      song({ Name: 'Bodysnatchers', Year: 2007, Genre: 'Alternative', 'Date Added': '2019-03-04T05:06:08Z' })
    ]))
    expect(books).toEqual([{
      ...BLANK,
      title: 'In Rainbows',
      author: 'Radiohead',
      medium: 'album',
      year: 2007,
      tags: ['alternative', 'apple-music'],
      dateAdded: '2019-03-04'
    }])
    expect(failed).toEqual([])
  })

  it('takes the earliest year, and none when no track has one', () => {
    expect(apple([song({ Year: 2008 }), song({ Year: 2007 }), song()])[0].year).toBe(2007)
    expect(apple([song()])[0].year).toBe(null)
  })

  it('takes the earliest date added, as its UTC date', () => {
    const books = apple([
      song({ 'Date Added': '2020-01-02T00:30:00Z' }),
      song({ 'Date Added': '2020-01-01T23:30:00Z' })
    ])
    expect(books[0].dateAdded).toBe('2020-01-01')
  })

  it('tags the most common genre, lowercased, with ties going alphabetically', () => {
    expect(apple([song({ Genre: 'Rock' }), song({ Genre: 'Alternative' }), song({ Genre: 'Rock' })])[0].tags).toEqual(['rock', 'apple-music'])
    expect(apple([song({ Genre: 'Rock' }), song({ Genre: 'Electronic' })])[0].tags).toEqual(['electronic', 'apple-music'])
  })

  it('tags only the source when no track has a genre', () => {
    expect(apple([song(), song({ Genre: ' ' })])[0].tags).toEqual(['apple-music'])
  })

  it('rates the album by its highest album rating set by hand, to the nearest half star', () => {
    expect(apple([song({ 'Album Rating': 80 }), song({ 'Album Rating': 60 })])[0].rating).toBe(4)
    expect(apple([song({ 'Album Rating': 90 })])[0].rating).toBe(4.5)
  })

  it('ignores an album rating Music computed from the song ratings', () => {
    expect(apple([song({ 'Album Rating': 100, 'Album Rating Computed': true })])[0].rating).toBe(null)
    expect(apple([
      song({ 'Album Rating': 100, 'Album Rating Computed': true }),
      song({ 'Album Rating': 40 })
    ])[0].rating).toBe(2)
  })

  it('gives a loved album with no rating 5 stars, under either name Music uses', () => {
    expect(apple([song({ 'Album Loved': true })])[0].rating).toBe(5)
    expect(apple([song({ 'Album Favorited': true })])[0].rating).toBe(5)
  })

  it('prefers a rating set by hand over a love', () => {
    expect(apple([song({ 'Album Loved': true, 'Album Rating': 60 })])[0].rating).toBe(3)
  })

  it('does not count a loved song as a loved album', () => {
    expect(apple([song({ Loved: true })])[0].rating).toBe(null)
  })
})
