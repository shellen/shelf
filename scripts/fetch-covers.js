#!/usr/bin/env node
/**
 * Fetch and cache book covers from Open Library + BookBrainz
 * Run with: node scripts/fetch-covers.js
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { getAllBooks, updateBookIsbn } from '../server/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const COVERS_DIR = path.join(ROOT, 'public', 'covers')
const CACHE_FILE = path.join(COVERS_DIR, '.cache.json')

// Rate limiting
const DELAY_MS = 400
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
  }
}

async function loadCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

async function saveCache(cache) {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2))
}

// Search Open Library and get multiple results
async function searchOpenLibrary(book) {
  const results = []

  try {
    const params = new URLSearchParams()
    if (book.title) params.set('title', book.title)
    if (book.author) params.set('author', book.author)
    params.set('limit', '5')
    params.set('fields', 'title,author_name,cover_i,isbn,key')

    const url = `https://openlibrary.org/search.json?${params}`
    const res = await fetch(url)

    if (res.ok) {
      const data = await res.json()
      for (const doc of (data?.docs || [])) {
        if (doc.cover_i) {
          results.push({
            source: 'openlibrary',
            title: doc.title,
            author: doc.author_name?.[0] || '',
            coverId: doc.cover_i,
            isbn: doc.isbn?.[0] || null,
            coverUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
            thumbUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
          })
        }
      }
    }
  } catch (e) {
    console.log(`  ⚠ Open Library search failed: ${e.message}`)
  }

  // Also try ISBN direct lookup if we have one
  if (book.isbn) {
    results.unshift({
      source: 'openlibrary-isbn',
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      coverUrl: `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`,
      thumbUrl: `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg`
    })
  }

  return results
}

// Search BookBrainz for covers
async function searchBookBrainz(book) {
  const results = []

  try {
    // BookBrainz search API
    const query = encodeURIComponent(`${book.title} ${book.author || ''}`.trim())
    const url = `https://bookbrainz.org/search?q=${query}&type=edition`

    // BookBrainz doesn't have a JSON API for search, so we try the cover art archive
    // which is linked to MusicBrainz/BookBrainz ecosystem
    // For now, we'll use their direct ISBN lookup if available
    if (book.isbn) {
      // Cover Art Archive supports ISBN lookups via their API
      const caaUrl = `https://coverartarchive.org/release/${book.isbn}`
      const res = await fetch(caaUrl, { method: 'HEAD' })
      if (res.ok) {
        results.push({
          source: 'coverartarchive',
          title: book.title,
          author: book.author,
          isbn: book.isbn,
          coverUrl: `https://coverartarchive.org/release/${book.isbn}/front`,
          thumbUrl: `https://coverartarchive.org/release/${book.isbn}/front-250`
        })
      }
    }
  } catch (e) {
    // BookBrainz/CAA lookup failed, that's okay
  }

  return results
}

// Search Google Books as another fallback
async function searchGoogleBooks(book) {
  const results = []

  try {
    const query = encodeURIComponent(`${book.title} ${book.author || ''}`.trim())
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=5`
    const res = await fetch(url)

    if (res.ok) {
      const data = await res.json()
      for (const item of (data?.items || [])) {
        const info = item.volumeInfo
        const imageLinks = info?.imageLinks
        if (imageLinks?.thumbnail) {
          // Google Books thumbnails are small, but we can modify the URL for larger
          const thumbUrl = imageLinks.thumbnail.replace('http://', 'https://')
          const coverUrl = thumbUrl.replace('zoom=1', 'zoom=2')

          results.push({
            source: 'googlebooks',
            title: info.title,
            author: info.authors?.[0] || '',
            isbn: info.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier || null,
            coverUrl,
            thumbUrl
          })
        }
      }
    }
  } catch (e) {
    console.log(`  ⚠ Google Books search failed: ${e.message}`)
  }

  return results
}

async function downloadCover(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const buffer = await res.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  // Check if it's a valid image (not a 1x1 placeholder)
  if (bytes.length < 1000) {
    throw new Error('Placeholder image (too small)')
  }

  await fs.writeFile(destPath, bytes)
  return bytes.length
}

async function fetchCover(book, cache) {
  const id = book.id

  // Check if already cached and file exists
  if (cache[id]?.status === 'ok' && !cache[id]?.needsRefresh) {
    const coverPath = path.join(COVERS_DIR, `${id}.jpg`)
    try {
      await fs.access(coverPath)
      console.log(`✓ ${book.title} (cached)`)
      return cache[id]
    } catch {
      // File missing, re-fetch
    }
  }

  console.log(`⟳ ${book.title}...`)

  // Gather cover options from multiple sources
  const [olResults, bbResults, gbResults] = await Promise.all([
    searchOpenLibrary(book),
    searchBookBrainz(book),
    searchGoogleBooks(book)
  ])

  // Combine and dedupe by source
  const allOptions = [...olResults, ...bbResults, ...gbResults]

  if (allOptions.length === 0) {
    console.log(`  ✗ No covers found`)
    return { status: 'missing', timestamp: Date.now(), options: [] }
  }

  // Try to download the first available cover
  let downloaded = false
  let selectedOption = null
  const coverPath = path.join(COVERS_DIR, `${id}.jpg`)

  for (const option of allOptions) {
    try {
      const size = await downloadCover(option.coverUrl, coverPath)
      console.log(`  ✓ Downloaded from ${option.source} (${Math.round(size / 1024)}KB)`)
      downloaded = true
      selectedOption = option

      // If we found an ISBN and the book doesn't have one, save it
      if (option.isbn && !book.isbn) {
        book.isbn = option.isbn
        updateBookIsbn(book.id, option.isbn)
      }
      break
    } catch (e) {
      // Try next option
    }
  }

  if (!downloaded) {
    console.log(`  ✗ All download attempts failed`)
    return {
      status: 'failed',
      timestamp: Date.now(),
      options: allOptions.map(o => ({ source: o.source, title: o.title, author: o.author, coverUrl: o.coverUrl }))
    }
  }

  return {
    status: 'ok',
    source: selectedOption.source,
    timestamp: Date.now(),
    // Store alternate options for manual selection later
    options: allOptions.map(o => ({ source: o.source, title: o.title, author: o.author, coverUrl: o.coverUrl }))
  }
}

async function main() {
  const args = process.argv.slice(2)
  const forceRefresh = args.includes('--force') || args.includes('-f')
  const bookId = args.find(a => !a.startsWith('-'))

  console.log('📚 Fetching book covers...')
  if (forceRefresh) console.log('   (force refresh mode)')
  console.log('')

  await ensureDir(COVERS_DIR)

  let books = getAllBooks()
  const cache = await loadCache()

  // Filter to specific book if ID provided
  if (bookId) {
    books = books.filter(b => b.id === bookId || b.title.toLowerCase().includes(bookId.toLowerCase()))
    if (books.length === 0) {
      console.log(`No books matching "${bookId}"`)
      process.exit(1)
    }
  }

  // Mark for refresh if forced
  if (forceRefresh) {
    for (const book of books) {
      if (cache[book.id]) {
        cache[book.id].needsRefresh = true
      }
    }
  }

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const book of books) {
    const result = await fetchCover(book, cache)
    cache[book.id] = result

    if (result.status === 'ok') {
      if (result.timestamp > Date.now() - 1000) updated++
      else skipped++
    } else {
      failed++
    }

    await sleep(DELAY_MS)
  }

  await saveCache(cache)

  console.log(`\n✨ Done! ${updated} downloaded, ${skipped} cached, ${failed} missing`)
}

main().catch(console.error)
