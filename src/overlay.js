// ABOUTME: The detail overlay: one item's fields, rating, notes, links and actions on a full-viewport sheet.
// ABOUTME: Markup plus entrance/exit motion and the cover's ink reveal; editing wiring stays in main.js.

import { esc } from './html.js'
import { spinePalette, spineTitle, wrapWords } from './spines.js'
import { singular } from './showcase.js'

const STARS = [1, 2, 3, 4, 5]
const INK_BLOBS = [[190, 330, 0], [430, 600, 120], [316, 120, 220], [114, 760, 300], [506, 250, 360], [329, 860, 420], [291, 470, 180]]
export const canAnimate = el => typeof el.animate === 'function'

function starsHtml(rating, readOnly) {
  const stars = STARS.map(star => {
    const fill = rating >= star ? 'filled' : rating >= star - 0.5 ? 'half-filled' : ''
    return `
      <span class="star-wrapper">
        <span class="star-display ${fill}">★</span>
        ${readOnly ? '' : `
        <button class="star-hit star-hit-left" data-action="set-rating" data-rating="${star - 0.5}" title="${star - 0.5} stars"></button>
        <button class="star-hit star-hit-right" data-action="set-rating" data-rating="${star}" title="${star} stars"></button>`}
      </span>`
  }).join('')
  return `
    <div class="detail-rating">
      ${stars}
      ${rating > 0 && !readOnly ? '<button class="star-clear" data-action="clear-rating">Clear</button>' : ''}
      ${rating > 0 ? `<span class="rating-value">${esc(rating)}</span>` : ''}
    </div>`
}

function posterHtml(book, settled) {
  const { bg, fg } = spinePalette(book.id)
  const lines = wrapWords(spineTitle(book.title).toUpperCase(), 13)
  const size = lines.some(l => l.length > 10) ? 52 : 62
  const radius = settled ? 900 : 0
  const tspans = lines.map((l, k) =>
    `<tspan x="300" y="${(450 - (lines.length - 1) * size * 0.55 + k * size * 1.1).toFixed(1)}">${esc(l)}</tspan>`
  ).join('')
  return `
    <div class="detail-poster">
      <svg viewBox="0 0 600 900" aria-hidden="true">
        <defs>
          <filter id="detail-ink-filter" filterUnits="userSpaceOnUse" x="-200" y="-200" width="1000" height="1300">
            <feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves="3" seed="7" result="t"/>
            <feDisplacementMap in="SourceGraphic" in2="t" scale="120" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
          <mask id="detail-ink" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1000" height="1300">
            <g filter="url(#detail-ink-filter)" fill="#fff">
              ${INK_BLOBS.map(([cx, cy, delay]) => `<circle class="detail-ink-blob" cx="${cx}" cy="${cy}" r="${radius}" data-delay="${delay}"/>`).join('')}
            </g>
          </mask>
          <clipPath id="detail-clip"><rect width="600" height="900" rx="4"/></clipPath>
        </defs>
        <g clip-path="url(#detail-clip)"><g mask="url(#detail-ink)">
          <rect width="600" height="900" fill="${bg}"/>
          <text x="300" y="90" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="600" font-size="18" letter-spacing="3.6" fill="${fg}">${esc((book.author || '').toUpperCase())}</text>
          <text text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="${size}" fill="${fg}">${tspans}</text>
          <text x="300" y="830" text-anchor="middle" font-family="Inter Tight, sans-serif" font-weight="500" font-size="20" letter-spacing="2.8" fill="${fg}">${esc(book.year || '')}</text>
          <image class="detail-cover-image" width="600" height="900" preserveAspectRatio="xMidYMid slice"/>
        </g></g>
      </svg>
    </div>`
}

export function renderDetail(book, { readOnly, savingCover, media, links, canPrev, canNext, settled }) {
  const medium = book.medium || 'book'
  const info = media.find(m => m.key === medium) || { label: `${medium}s`, creator: 'Author' }
  const rating = book.rating || 0
  const tags = book.tags || []
  const locked = readOnly ? 'readonly' : ''
  const titleRows = Math.min(4, Math.max(1, Math.ceil(String(book.title || '').length / 18)))
  const meta = [
    book.year ? esc(book.year) : null,
    book.pages ? `${esc(book.pages)} pages` : null,
    book.dateRead ? `read ${esc(book.dateRead)}` : null,
    readOnly && book.isbn ? `ISBN ${esc(book.isbn)}` : null,
  ].filter(Boolean).join(' &bull; ') || '&nbsp;'

  return `
    <div class="detail" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <button class="btn detail-close" data-action="close-detail">Close</button>
      <div class="detail-step">
        <button class="btn" data-action="detail-prev" aria-label="Previous item" ${canPrev ? '' : 'disabled'}>&larr;</button>
        <button class="btn" data-action="detail-next" aria-label="Next item" ${canNext ? '' : 'disabled'}>&rarr;</button>
      </div>
      <div class="detail-text">
        <div class="dm"><span class="detail-kicker">${esc(singular(info.label))}</span></div>
        <div class="dm"><textarea id="detail-title" class="detail-title" data-field="title" data-original="${esc(book.title)}" placeholder="Title" rows="${titleRows}" ${locked}>${esc(book.title)}</textarea></div>
        <div class="dm"><input class="detail-author" data-field="author" value="${esc(book.author)}" data-original="${esc(book.author)}" placeholder="${esc(info.creator)}" ${locked}></div>
        ${readOnly ? '' : `
        <div class="dm"><select class="detail-medium" data-field="medium" data-original="${esc(medium)}">
          ${media.map(m => `<option value="${m.key}" ${medium === m.key ? 'selected' : ''}>${esc(singular(m.label))}</option>`).join('')}
        </select></div>`}
        ${book.author ? '<div class="dm"><button class="detail-author-link" data-action="author-route">More by this author &rarr;</button></div>' : ''}
        <div class="dm">${starsHtml(rating, readOnly)}</div>
        <div class="dm">${readOnly
          ? `<div class="detail-tags">${tags.map(t => `<span class="detail-tag">${esc(t)}</span>`).join('')}</div>`
          : `<input class="detail-tags-input" data-field="tags" value="${esc(tags.join(', '))}" data-original="${esc(tags.join(', '))}" placeholder="tags, comma, separated">`}</div>
        <div class="dm"><div class="detail-meta">${meta}</div></div>
        ${readOnly ? '' : `
        <div class="dm"><label class="detail-isbn-row"><span>ISBN</span><input class="detail-isbn" data-field="isbn" value="${esc(book.isbn)}" data-original="${esc(book.isbn)}" placeholder="—"></label></div>`}
        <div class="dm detail-notes">
          <label class="notes-label">Notes</label>
          <textarea class="notes-input" data-action="notes" placeholder="${readOnly ? '' : 'Add your notes...'}" ${locked}>${esc(book.notes)}</textarea>
        </div>
        <div class="dm"><div class="detail-links">${links.map(([label, href]) => `<a class="btn" href="${esc(href)}" target="_blank" rel="noreferrer">${esc(label)}</a>`).join('')}</div></div>
        ${readOnly ? '' : `
        <div class="dm detail-actions">
          <button class="btn" data-action="open-cover-picker" ${savingCover ? 'disabled' : ''}>${savingCover ? '<span class="loading"></span>' : 'Change Cover'}</button>
          <button class="btn btn-danger" data-action="delete-book">Remove Book</button>
        </div>`}
      </div>
      ${posterHtml(book, settled)}
    </div>`
}

// Inset clip-path framing a rect that was drawn rotated by `deg` about its centre,
// recovered from that rotated rect's axis-aligned bounding box
export function insetFrom(rect, deg, viewport) {
  const a = Math.abs(deg) * Math.PI / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const c2 = c * c - s * s
  let w = (rect.width * c - rect.height * s) / c2
  let h = (rect.height * c - rect.width * s) / c2
  if (!(w > 0) || !(h > 0)) {
    w = rect.width
    h = rect.height
  }
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  return {
    clip: `inset(${cy - h / 2}px ${viewport.width - (cx + w / 2)}px ${viewport.height - (cy + h / 2)}px ${cx - w / 2}px round 3px)`,
    origin: `${cx}px ${cy}px`,
  }
}

function revealInk(el, delay) {
  const blobs = [...el.querySelectorAll('.detail-ink-blob')]
  const start = performance.now() + delay
  const frame = now => {
    const elapsed = now - start
    blobs.forEach(b => {
      const p = Math.min(1, Math.max(0, (elapsed - Number(b.dataset.delay)) / 1250))
      b.setAttribute('r', (900 * (1 - Math.pow(1 - p, 3))).toFixed(1))
    })
    if (elapsed < 2400 && el.isConnected) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

// `from` is { rect, rotate } for the cover or tile it grows out of, or null to fade in.
// Reduced motion always gets the plain fade, with the cover already inked in.
export function playEntrance(el, from, { reducedMotion = false } = {}) {
  if (!canAnimate(el)) return
  if (reducedMotion) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
    return
  }
  if (from) {
    const { clip, origin } = insetFrom(from.rect, from.rotate, { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight })
    el.style.transformOrigin = origin
    el.animate([
      { clipPath: clip, transform: `rotate(${from.rotate}deg)` },
      { clipPath: 'inset(0px 0px 0px 0px round 0px)', transform: 'rotate(0deg)' },
    ], { duration: 1050, easing: 'cubic-bezier(.76,0,.18,1)', fill: 'backwards' })
  } else {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' })
  }
  el.querySelectorAll('.dm > *').forEach((child, k) => {
    // The extra 8px clears the focus-ring padding at the foot of each .dm mask
    child.animate([{ transform: 'translateY(calc(110% + 8px))' }, { transform: 'translateY(0)' }],
      { duration: 900, delay: (from ? 620 : 120) + k * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' })
  })
  revealInk(el, from ? 520 : 0)
}

// Animates a detached copy back into `to` so app state can change immediately.
// Reduced motion leaves no copy: the detail simply goes.
export function playExit(el, to, { reducedMotion = false } = {}) {
  if (reducedMotion || !canAnimate(el)) return
  const ghost = el.cloneNode(true)
  ghost.classList.add('detail-ghost')
  ghost.inert = true
  ghost.setAttribute('aria-hidden', 'true')
  ghost.querySelector('[mask]')?.removeAttribute('mask')
  document.body.append(ghost)
  let frames = [{ opacity: 1 }, { opacity: 0 }]
  if (to) {
    const { clip, origin } = insetFrom(to.rect, to.rotate, { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight })
    ghost.style.transformOrigin = origin
    frames = [
      { clipPath: 'inset(0px 0px 0px 0px round 0px)', transform: 'rotate(0deg)' },
      { clipPath: clip, transform: `rotate(${to.rotate}deg)` },
    ]
  }
  const animation = ghost.animate(frames, { duration: to ? 850 : 200, easing: 'cubic-bezier(.76,0,.18,1)', fill: 'both' })
  animation.onfinish = () => ghost.remove()
}
