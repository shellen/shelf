// ABOUTME: Derives an item's printed look: spine cloth colour, short title, creator, and its typographic cover.
// ABOUTME: Colours are deterministic per item id so a spine keeps its colour across renders.

import { esc } from './html.js'

export const SPINE_PALETTE = [
  { bg: '#1B1A18', fg: '#EDE3CC' },
  { bg: '#1F3FB0', fg: '#EDE3CC' },
  { bg: '#B33A24', fg: '#EDE3CC' },
  { bg: '#E6DBC2', fg: '#141414' },
  { bg: '#C9A227', fg: '#141414' },
  { bg: '#2F4F3E', fg: '#EDE3CC' },
  { bg: '#6B3A4B', fg: '#EDE3CC' },
]

// FNV-1a string hash: small, fast and stable across runs
function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function spinePalette(id) {
  return SPINE_PALETTE[hash(String(id)) % SPINE_PALETTE.length]
}

export function spineTitle(title) {
  const full = String(title || '')
  const short = full.split(/:\s/)[0].replace(/\s*\([^)]*#\s*\d+[^)]*\)\s*$/, '').trim()
  return short || full
}

export function spineCreator(name) {
  const parts = String(name || '').replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').trim().split(/\s+/)
  return parts[parts.length - 1] || ''
}

// Breaks text into at most four lines of about `max` characters, at word boundaries.
// Text that does not fit in four lines ends the fourth with an ellipsis.
export function wrapWords(text, max) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > max && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  if (lines.length <= 4) return lines
  return [...lines.slice(0, 3), `${lines[3]}…`]
}

// The cover's type sits in about 492 of its 600 units; these keep it there
const TITLE_ROOM = 492
const TITLE_CHAR_WIDTH = 0.8
const CREATOR_CHARS = 30

// The largest title size, up to 62 and no smaller than 24, at which the longest line fits
function titleSize(lines) {
  const longest = Math.max(1, ...lines.map(l => l.length))
  return Math.max(24, Math.min(62, Math.floor(TITLE_ROOM / (longest * TITLE_CHAR_WIDTH))))
}

function shortCreator(name) {
  return name.length > CREATOR_CHARS ? `${name.slice(0, CREATOR_CHARS - 1).trimEnd()}…` : name
}

// The typographic cover for an item with no art, as shapes for a 600×900 SVG:
// its cloth colour behind its creator, its short title and its year
export function coverTypeSvg(book) {
  const { bg, fg } = spinePalette(book.id)
  const lines = wrapWords((spineTitle(book.title) || 'Untitled').toUpperCase(), 13)
  const size = titleSize(lines)
  const tspans = lines.map((l, k) =>
    `<tspan x="300" y="${(450 - (lines.length - 1) * size * 0.55 + k * size * 1.1).toFixed(1)}">${esc(l)}</tspan>`
  ).join('')
  return `<rect width="600" height="900" fill="${bg}"/>
    <text x="300" y="90" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="600" font-size="18" letter-spacing="3.6" fill="${fg}">${esc(shortCreator((book.author || '').toUpperCase()))}</text>
    <text text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="${size}" fill="${fg}">${tspans}</text>
    <text x="300" y="830" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="500" font-size="20" letter-spacing="2.8" fill="${fg}">${esc(book.year || '')}</text>`
}
