// ABOUTME: The shelf view: markup for the showcase rail, 3D carousel and caption, plus the
// ABOUTME: controller that drives the carousel's motion, pointer input and caption for one render.

import { esc } from './html.js'
import { captionState, starText } from './showcase.js'
import { spinePalette, spineTitle, spineCreator } from './spines.js'
import { wraps, slotCount, positionFor, relativePosition, itemIndexAt, clampPosition, faceOut, slotOffset } from './carousel.js'

const ARROW_PREV = '<svg width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M5 1 L1 5 L5 9 M1 5 H17"/></svg>'
const ARROW_NEXT = '<svg width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M13 1 L17 5 L13 9 M17 5 H1"/></svg>'
const PLAY = '<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="1,0 12,6 1,12" fill="currentColor"/></svg>'
const TILT_DEG = -4.5

// Survives re-renders so a fresh mount can start the cursor where the pointer already is.
let lastPointer = null

function captionHtml(book) {
  const line = [book.author, captionState(book)].filter(Boolean).map(esc).join(' &middot; ')
  return `<span class="shelf-caption-title">${esc(spineTitle(book.title))}</span>`
    + `<span class="shelf-caption-line">${line || '&nbsp;'}</span>`
    + `<span class="shelf-caption-stars">${starText(book.rating) || '&nbsp;'}</span>`
}

function tapeHtml(book) {
  const { bg, fg } = spinePalette(book.id)
  const title = spineTitle(book.title)
  const len = Math.max(8, title.length * 0.62).toFixed(2)
  return `
    <div class="tape" data-id="${esc(book.id)}" style="--bg:${bg};--fg:${fg}">
      <div class="tape-face tape-spine" style="--len:${len}">
        <span class="tape-spine-title">${esc(title)}</span>
        <span class="tape-spine-creator">${esc(spineCreator(book.author))}</span>
      </div>
      <div class="tape-face tape-cover">
        <div class="tape-cover-type">
          <span class="tape-cover-creator">${esc(book.author || '')}</span>
          <span class="tape-cover-title">${esc(title)}</span>
          <span class="tape-cover-year">${esc(book.year || '')}</span>
        </div>
      </div>
    </div>`
}

export function renderShelfView({ groups, activeKey, index, total, canAdd }) {
  if (!groups.length) {
    return `
      <div class="shelf-view shelf-empty">
        <p class="shelf-empty-text">Nothing on this shelf yet.</p>
        ${canAdd ? '<button class="btn" data-action="add-book">Add Media</button>' : ''}
      </div>`
  }
  const group = groups.find(g => g.key === activeKey) || groups[0]
  const book = group.items[Math.max(0, Math.min(index, group.items.length - 1))]
  return `
    <div class="shelf-view">
      <nav class="shelf-rail" aria-label="Showcase">
        ${groups.map(g => `<button class="shelf-tab ${g.key === group.key ? 'active' : ''}" aria-pressed="${g.key === group.key}" data-shelf-group="${esc(g.key)}">${esc(g.label)} <span class="shelf-tab-count">${g.items.length}</span></button>`).join('')}
      </nav>
      <div class="shelf-stage-wrap"><div class="shelf-stage" aria-hidden="true"></div></div>
      <button class="shelf-open" data-shelf-open aria-label="Open">${PLAY}</button>
      <div class="shelf-caption" aria-live="polite">${captionHtml(book)}</div>
      <button class="shelf-arrow shelf-prev" data-shelf-step="-1" aria-label="Previous">${ARROW_PREV}</button>
      <button class="shelf-arrow shelf-next" data-shelf-step="1" aria-label="Next">${ARROW_NEXT}</button>
      <div class="shelf-foot">${group.items.length} in ${esc(group.label)} &middot; ${total} in the library</div>
      <div class="shelf-cursor" aria-hidden="true"><span class="shelf-cursor-ring"></span><span class="shelf-cursor-dot"></span><span class="shelf-cursor-label">Open</span></div>
    </div>`
}

export function mountShelf(root, {
  items,
  index = 0,
  reducedMotion = false,
  resolveCover = () => Promise.resolve(null),
  onIndexChange = () => {},
  onOpen = () => {},
}) {
  const count = items.length
  const wrap = root.querySelector('.shelf-stage-wrap')
  const stage = root.querySelector('.shelf-stage')
  const caption = root.querySelector('.shelf-caption')
  const openButton = root.querySelector('.shelf-open')
  const cursor = root.querySelector('.shelf-cursor')

  stage.innerHTML = Array.from({ length: slotCount(count) }, (_, v) => tapeHtml(items[v % count])).join('')
  const tapes = [...stage.querySelectorAll('.tape')].map(el => ({
    el,
    spine: el.querySelector('.tape-spine'),
    cover: el.querySelector('.tape-cover'),
    lift: 0,
    visible: null,
  }))

  let target = clampPosition(positionFor(index, count), count)
  let pos = target
  let shown = itemIndexAt(target, count)
  let hover = -1
  let overButton = false
  let drag = null
  let suppressClick = false
  let wheelTimer = 0
  let raf = 0
  let last = 0
  let destroyed = false
  let tiltX = 0
  let tiltY = 0
  const pointer = { x: lastPointer?.x ?? 0, y: lastPointer?.y ?? 0, cx: lastPointer?.x ?? 0, cy: lastPointer?.y ?? 0 }
  let pointerKnown = !!lastPointer
  let geom = measure()

  function measure() {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;width:1px;height:var(--shelf-h)'
    root.append(probe)
    const h = probe.getBoundingClientRect().height
    probe.remove()
    const size = { h, spineWidth: h * 0.165, faceWidth: h * 2 / 3, gap: h * 0.03 }
    stage.style.setProperty('--h', `${size.h}px`)
    stage.style.setProperty('--ws', `${size.spineWidth}px`)
    stage.style.setProperty('--d', `${size.faceWidth}px`)
    return size
  }

  const stride = () => (geom.spineWidth + geom.gap) || 1

  function swapCaption(dir) {
    caption.innerHTML = captionHtml(items[shown])
    if (reducedMotion || typeof caption.animate !== 'function') return
    caption.animate(
      [{ transform: `translateY(${dir * 40}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)' }
    )
  }

  function setTarget(x) {
    const dir = x >= target ? 1 : -1
    target = clampPosition(x, count)
    const i = itemIndexAt(target, count)
    if (i === shown) return
    shown = i
    swapCaption(dir)
    onIndexChange(i)
  }

  function step(delta) {
    setTarget(Math.round(target) + delta)
  }

  function goTo(i) {
    let delta = i - itemIndexAt(target, count)
    if (wraps(count)) {
      if (delta > count / 2) delta -= count
      if (delta < -count / 2) delta += count
    }
    setTarget(Math.round(target) + delta)
  }

  function centreRect() {
    let best = null
    let bestDistance = Infinity
    tapes.forEach((t, v) => {
      const d = Math.abs(relativePosition(v, pos, count))
      if (d < bestDistance) { bestDistance = d; best = t }
    })
    return best ? best.cover.getBoundingClientRect() : null
  }

  function open() {
    setTarget(Math.round(target))
    onOpen(shown, centreRect())
  }

  function tick(now) {
    const dt = last ? Math.max(0, Math.min(0.05, (now - last) / 1000)) : 1
    last = now
    const k = drag?.moved ? 18 : 5.2
    const spring = reducedMotion ? 1 : 1 - Math.exp(-k * dt)
    pos += (target - pos) * spring
    if (Math.abs(target - pos) < 1e-4) pos = target
    if (wraps(count)) {
      const length = count * 3
      if (Math.abs(pos) > 4 * length) {
        const shift = (Math.floor(pos / length) - 1) * length
        pos -= shift
        target -= shift
        if (drag) drag.t0 -= shift
      }
    }

    const base = root.getBoundingClientRect()
    const box = wrap.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const { h, faceWidth } = geom
    const safeH = h || 1
    const safeFace = faceWidth || 1
    const follow = 1 - Math.exp(-16 * dt)
    pointer.cx += (pointer.x - pointer.cx) * follow
    pointer.cy += (pointer.y - pointer.cy) * follow

    const onCover = pointerKnown && h > 0 && Math.abs(pointer.x - cx) < 0.55 * faceWidth && Math.abs(pointer.y - cy) < 0.55 * h && Math.abs(target - pos) < 0.3
    const goalY = onCover ? (pointer.x - cx) / (0.55 * safeFace) * 9 : pointerKnown ? (pointer.x - cx) / (innerWidth || 1) * 5 : 0
    const goalX = onCover ? -(pointer.y - cy) / (safeH / 2) * 6 : 0
    const ease = 1 - Math.exp(-7 * dt)
    tiltY += (goalY - tiltY) * ease
    tiltX += (goalX - tiltX) * ease

    const liftEase = reducedMotion ? 1 : 1 - Math.exp(-12 * dt)
    const limit = innerWidth / 2 + 1.5 * faceWidth
    let hoverSpine = false
    tapes.forEach((t, v) => {
      const r = relativePosition(v, pos, count)
      const x = slotOffset(r, geom)
      const visible = Math.abs(x) <= limit
      if (visible !== t.visible) {
        t.el.style.visibility = visible ? '' : 'hidden'
        t.visible = visible
      }
      if (!visible) return
      const lifted = hover === v && Math.abs(r) > 0.5 ? 1 : 0
      if (lifted) hoverSpine = true
      t.lift += (lifted - t.lift) * liftEase
      const o = faceOut(r)
      const y = -o * 0.025 * h - t.lift * 0.045 * h
      t.el.style.transform = `translate3d(${x}px,${y}px,${o * 0.2 * h}px) rotateZ(${TILT_DEG * o}deg) rotateX(${tiltX * o}deg) rotateY(${-90 * o + tiltY * o}deg)`
      t.el.style.zIndex = String(Math.round(100 - Math.abs(r) * 4))
      t.spine.style.setProperty('--shade', (o * 0.55).toFixed(3))
      t.cover.style.setProperty('--shade', ((1 - o) * 0.5).toFixed(3))
    })

    const settled = faceOut(Math.min(1, Math.abs(target - pos) * 3))
    openButton.style.left = `${cx - base.left - 0.5 * faceWidth - 6}px`
    openButton.style.top = `${cy - base.top + 0.36 * h}px`
    openButton.style.transform = `scale(${settled})`
    openButton.style.pointerEvents = settled < 0.5 ? 'none' : ''

    if (cursor) {
      cursor.style.visibility = pointerKnown ? '' : 'hidden'
      cursor.style.transform = `translate3d(${pointer.cx}px,${pointer.cy}px,0)`
      cursor.dataset.state = overButton ? 'button' : onCover ? 'open' : hoverSpine ? 'spine' : ''
    }
    if (!destroyed && root.isConnected) raf = requestAnimationFrame(tick)
  }

  function onPointerMove(e) {
    pointer.x = e.clientX
    pointer.y = e.clientY
    if (!pointerKnown) {
      pointer.cx = pointer.x
      pointer.cy = pointer.y
      pointerKnown = true
    }
    lastPointer = { x: pointer.x, y: pointer.y }
    if (!drag) return
    const dx = e.clientX - drag.x0
    if (!drag.moved && Math.abs(dx) > 5) drag.moved = true
    if (drag.moved) setTarget(drag.t0 - dx / stride())
  }

  function onPointerUp() {
    if (!drag) return
    if (drag.moved) {
      setTarget(Math.round(target))
      suppressClick = true
      setTimeout(() => { suppressClick = false }, 60)
    }
    drag = null
  }

  function onResize() {
    geom = measure()
  }

  wrap.addEventListener('pointerdown', e => {
    if (e.button > 0) return
    drag = { x0: e.clientX, t0: target, moved: false }
  })
  wrap.addEventListener('click', e => {
    if (!suppressClick) return
    e.stopPropagation()
    suppressClick = false
  }, true)
  root.addEventListener('wheel', e => {
    if (e.ctrlKey) return
    e.preventDefault()
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    setTarget(target + delta * unit / stride() * 0.5)
    clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => setTarget(Math.round(target)), 160)
  }, { passive: false })
  root.addEventListener('pointerover', e => {
    overButton = !!e.target.closest?.('button, a')
    const tape = e.target.closest?.('.tape')
    hover = tape ? tapes.findIndex(t => t.el === tape) : -1
  })
  stage.addEventListener('pointerleave', () => { hover = -1 })
  stage.addEventListener('click', e => {
    const tape = e.target.closest('.tape')
    if (!tape) return
    const r = relativePosition(tapes.findIndex(t => t.el === tape), pos, count)
    const slot = Math.round(pos + r)
    if (Math.abs(r) < 0.5 && slot === Math.round(target)) open()
    else setTarget(slot)
  })
  // A mouse click releases button focus so Enter goes on to open the centred item
  root.addEventListener('click', e => {
    const button = e.target.closest('[data-shelf-step], [data-shelf-open]')
    if (!button) return
    if (e.detail > 0) button.blur()
    if (button.dataset.shelfStep) step(Number(button.dataset.shelfStep))
    else open()
  })
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('resize', onResize)

  items.forEach(book => {
    resolveCover(book).then(url => {
      if (!url || destroyed) return
      tapes.forEach(t => {
        if (t.el.dataset.id !== String(book.id)) return
        t.cover.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`
        t.cover.classList.add('has-image')
      })
    })
  })

  tick(performance.now())

  return {
    step,
    goTo,
    open,
    centreRect,
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      clearTimeout(wheelTimer)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('resize', onResize)
    },
  }
}
