#!/usr/bin/env node
/**
 * Add a book via ISBN or title/author
 * Run with: node scripts/add-book.js [ISBN or "Title" by "Author"]
 *
 * Examples:
 *   node scripts/add-book.js 9780143127741
 *   node scripts/add-book.js "The Design of Everyday Things" "Don Norman"
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BOOKS_PATH = path.join(ROOT, 'books.json')

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
}

async function lookupISBN(isbn) {
  console.log(`Looking up ISBN ${isbn}...`)

  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Open Library API error: ${res.status}`)
  }

  const data = await res.json()
  const bookData = data[`ISBN:${isbn}`]

  if (!bookData) {
    throw new Error('Book not found with that ISBN')
  }

  return {
    title: bookData.title || '',
    author: bookData.authors?.[0]?.name || '',
    isbn: isbn,
    subjects: bookData.subjects?.slice(0, 3).map(s => s.name.toLowerCase()) || []
  }
}

async function searchBook(title, author = '') {
  console.log(`Searching for "${title}"${author ? ` by ${author}` : ''}...`)

  const params = new URLSearchParams()
  params.set('title', title)
  if (author) params.set('author', author)
  params.set('limit', '5')
  params.set('fields', 'title,author_name,isbn,subject,cover_i')

  const url = `https://openlibrary.org/search.json?${params}`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Open Library search error: ${res.status}`)
  }

  const data = await res.json()

  if (!data.docs?.length) {
    throw new Error('No books found matching that search')
  }

  return data.docs.map(doc => ({
    title: doc.title || '',
    author: doc.author_name?.[0] || '',
    isbn: doc.isbn?.[0] || null,
    subjects: doc.subject?.slice(0, 5).map(s => s.toLowerCase()) || [],
    hasCover: !!doc.cover_i
  }))
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function main() {
  const args = process.argv.slice(2)

  let bookInfo = null

  if (args.length === 0) {
    // Interactive mode
    const input = await prompt('Enter ISBN or book title: ')

    if (/^[\d-]{10,17}$/.test(input.replace(/-/g, ''))) {
      bookInfo = await lookupISBN(input.replace(/-/g, ''))
    } else {
      const author = await prompt('Author (optional): ')
      const results = await searchBook(input, author)

      console.log('\nFound:')
      results.forEach((r, i) => {
        const cover = r.hasCover ? '📖' : '  '
        console.log(`  ${i + 1}. ${cover} "${r.title}" by ${r.author || 'Unknown'}`)
      })

      const choice = await prompt('\nSelect (1-5) or 0 to enter manually: ')
      const idx = parseInt(choice) - 1

      if (idx >= 0 && idx < results.length) {
        bookInfo = results[idx]
      } else {
        bookInfo = { title: input, author: author, subjects: [] }
      }
    }
  } else if (args.length === 1 && /^[\d-]{10,17}$/.test(args[0].replace(/-/g, ''))) {
    // ISBN provided
    bookInfo = await lookupISBN(args[0].replace(/-/g, ''))
  } else {
    // Title (and optionally author) provided
    const [title, author] = args
    const results = await searchBook(title, author)
    bookInfo = results[0] // Take first result
  }

  // Get shelf number
  const shelf = await prompt(`Shelf number (default 1): `) || '1'

  // Get/confirm tags
  const suggestedTags = bookInfo.subjects?.slice(0, 3).join(', ') || ''
  const tagsInput = await prompt(`Tags (${suggestedTags || 'comma-separated'}): `) || suggestedTags
  const tags = tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)

  // Create book entry
  const id = `s${shelf}-${slugify(bookInfo.title)}`

  const newBook = {
    id,
    shelf: parseInt(shelf),
    title: bookInfo.title,
    author: bookInfo.author || '',
    tags,
  }

  if (bookInfo.isbn) {
    newBook.isbn = bookInfo.isbn
  }

  // Load existing books
  const booksData = JSON.parse(await fs.readFile(BOOKS_PATH, 'utf-8'))

  // Check for duplicates
  const existing = booksData.books.find(b =>
    b.title.toLowerCase() === newBook.title.toLowerCase() ||
    (newBook.isbn && b.isbn === newBook.isbn)
  )

  if (existing) {
    console.log(`\n⚠️  Similar book already exists: "${existing.title}"`)
    const confirm = await prompt('Add anyway? (y/N): ')
    if (confirm.toLowerCase() !== 'y') {
      console.log('Cancelled.')
      process.exit(0)
    }
  }

  // Add the book
  booksData.books.push(newBook)
  await fs.writeFile(BOOKS_PATH, JSON.stringify(booksData, null, 2))

  console.log(`\n✅ Added: "${newBook.title}" by ${newBook.author || 'Unknown'}`)
  console.log(`   Shelf ${newBook.shelf}, Tags: ${newBook.tags.join(', ') || 'none'}`)
  console.log(`\nRun 'npm run fetch-covers' to download the cover image.`)
}

main().catch(e => {
  console.error(`\n❌ Error: ${e.message}`)
  process.exit(1)
})
