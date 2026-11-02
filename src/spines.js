// ABOUTME: Derives a book spine's look from an item: cloth colour, short title, subtitle, creator.
// ABOUTME: Colours are deterministic per item id so a spine keeps its colour across renders.

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
