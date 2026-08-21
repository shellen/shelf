// ABOUTME: Vercel function serving OpenGraph pages for path-style share URLs.
import { getAllBooks } from '../server/db.js'
import { buildOgPage } from '../server/og.js'

export default async function handler(req, res) {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const host = req.headers['x-forwarded-host'] || req.headers.host || ''
    const html = buildOgPage(path, await getAllBooks(), `${proto}://${host}`)
    if (!html) {
      res.statusCode = 302
      res.setHeader('Location', '/')
      return res.end()
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
    res.end(html)
  } catch (e) {
    console.error('OG page failed:', e)
    res.statusCode = 302
    res.setHeader('Location', '/')
    res.end()
  }
}
