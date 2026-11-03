// ABOUTME: The shelf view: markup for the showcase rail, 3D carousel and caption, plus the
// ABOUTME: controller that drives the carousel's motion, pointer input and caption for one render.

import { esc } from './html.js'
import { captionState, starText, coverShape, mediumOf } from './showcase.js'
import { spinePalette, spineTitle, spineCreator } from './spines.js'
import { wraps, slotCount, positionFor, relativePosition, itemIndexAt, clampPosition, faceOut, shelfLayout } from './carousel.js'

const ARROW_PREV = '<svg width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M5 1 L1 5 L5 9 M1 5 H17"/></svg>'
const ARROW_NEXT = '<svg width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M13 1 L17 5 L13 9 M17 5 H1"/></svg>'
const PLAY = '<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="1,0 12,6 1,12" fill="currentColor"/></svg>'
export const TILT_DEG = -4.5

// Each shape's spine and face width on a shelf h tall: a book's 2:3 face, or a full-height
// square face with a spine about half a book's, like a CD's
const SIZES = {
  tall: h => ({ spineWidth: h * 0.165, faceWidth: h * 2 / 3 }),
  square: h => ({ spineWidth: h * 0.08, faceWidth: h }),
}

// Survives re-renders so a fresh mount can start the cursor where the pointer already is,
// and only if the pointer was over the shelf rather than the header.
let lastPointer = null

// Eases `value` towards `goal` by `amount`, landing on it once within `epsilon`
function approach(value, goal, amount, epsilon) {
  const next = value + (goal - value) * amount
  return Math.abs(goal - next) < epsilon ? goal : next
}

const openLabel = book => `Open ${book.title || 'Untitled'}`

function captionHtml(book) {
  const line = [book.author, captionState(book)].filter(Boolean).map(esc).join(' &middot; ')
  return `<span class="shelf-caption-title">${esc(spineTitle(book.title))}</span>`
    + `<span class="shelf-caption-line">${line || '&nbsp;'}</span>`
    + `<span class="shelf-caption-stars">${starText(book.rating) || '&nbsp;'}</span>`
}

// The face shown until art arrives: a record carrying the artist and short title for an album,
// otherwise the creator, short title and year set in type
function faceTypeHtml(book, title) {
  if (mediumOf(book) === 'album') {
    return `
        <div class="tape-cover-type tape-cover-record">
          <div class="tape-record-label">
            <span class="tape-record-creator">${esc(book.author || '')}</span>
            <span class="tape-record-title">${esc(title)}</span>
          </div>
        </div>`
  }
  return `
        <div class="tape-cover-type">
          <span class="tape-cover-creator">${esc(book.author || '')}</span>
          <span class="tape-cover-title">${esc(title)}</span>
          <span class="tape-cover-year">${esc(book.year || '')}</span>
        </div>`
}

function tapeHtml(book) {
  const { bg, fg } = spinePalette(book.id)
  const title = spineTitle(book.title)
  const len = Math.max(8, title.length * 0.62).toFixed(2)
  const shape = coverShape(book) === 'square' ? ' tape-square' : ''
  return `
    <div class="tape${shape}" data-id="${esc(book.id)}" style="--bg:${bg};--fg:${fg}">
      <div class="tape-face tape-spine" style="--len:${len}">
        <span class="tape-spine-title">${esc(title)}</span>
        <span class="tape-spine-creator">${esc(spineCreator(book.author))}</span>
      </div>
      <div class="tape-face tape-cover">${faceTypeHtml(book, title)}
      </div>
    </div>`
}

export function renderShelfView({ tabs, activeKey, index, total, canAdd }) {
  if (!tabs.length) {
    return `
      <div class="shelf-view shelf-empty">
        <p class="shelf-empty-text">Nothing on this shelf yet.</p>
        ${canAdd ? '<button class="btn" data-action="add-book">Add Media</button>' : ''}
      </div>`
  }
  const tab = tabs.find(t => t.key === activeKey) || tabs[0]
  const book = tab.items[Math.max(0, Math.min(index, tab.items.length - 1))]
  return `
    <div class="shelf-view">
      <nav class="shelf-rail" aria-label="Showcase">
        ${tabs.map(t => `<button class="shelf-tab ${t.key === tab.key ? 'active' : ''}" aria-pressed="${t.key === tab.key}" data-shelf-tab="${esc(t.key)}">${esc(t.label)} <span class="shelf-tab-count">${t.items.length}</span></button>`).join('')}
      </nav>
      <div class="shelf-stage-wrap"><div class="shelf-stage" aria-hidden="true"></div></div>
      <button class="shelf-open" data-shelf-open aria-label="${esc(openLabel(book))}">${PLAY}</button>
      <div class="shelf-caption" aria-live="polite">${captionHtml(book)}</div>
      <button class="shelf-arrow shelf-prev" data-shelf-step="-1" aria-label="Previous">${ARROW_PREV}</button>
      <button class="shelf-arrow shelf-next" data-shelf-step="1" aria-label="Next">${ARROW_NEXT}</button>
      <div class="shelf-foot">${tab.items.length} in ${esc(tab.label)} &middot; ${total} in the library</div>
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
  const prevButton = root.querySelector('.shelf-prev')
  const nextButton = root.querySelector('.shelf-next')
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
  let pointed = null
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
  let pointerInside = !!lastPointer?.inside
  let geom = measure()

  // The custom cursor shows only for a pointer that is over the shelf; the class lets the
  // stylesheet hide the system cursor at the same moment.
  const cursorShowing = () => pointerKnown && pointerInside
  const syncCursor = () => root.classList.toggle('has-pointer', cursorShowing())

  function measure() {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;width:1px;height:var(--shelf-h)'
    root.append(probe)
    const h = probe.getBoundingClientRect().height
    probe.remove()
    const sizes = items.map(book => SIZES[coverShape(book)](h))
    stage.style.setProperty('--h', `${h}px`)
    tapes.forEach((t, v) => {
      const { spineWidth, faceWidth } = sizes[v % count]
      t.el.style.setProperty('--ws', `${spineWidth}px`)
      t.el.style.setProperty('--d', `${faceWidth}px`)
    })
    const gap = h * 0.03
    return { h, gap, sizes, layout: shelfLayout(sizes, gap) }
  }

  // The size of the item nearest position x, whose face is the one turned out there
  const sizeAt = x => geom.sizes[itemIndexAt(x, count)]
  // Near the centre a face travels its stride plus the room it opens, per slot
  function centreTravel() {
    const { spineWidth, faceWidth } = sizeAt(target)
    return (spineWidth + geom.gap) + faceWidth - spineWidth + 1.6 * geom.gap
  }
  const settleDistance = () => sizeAt(target).faceWidth > 0 ? 0.5 / centreTravel() : 1e-3

  function swapCaption(dir) {
    caption.innerHTML = captionHtml(items[shown])
    openButton.setAttribute('aria-label', openLabel(items[shown]))
    if (reducedMotion || typeof caption.animate !== 'function') return
    caption.animate(
      [{ transform: `translateY(${dir * 40}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)' }
    )
  }

  // A short list's arrows are disabled at its ends; one that held focus hands it to the open button
  function syncArrows() {
    if (wraps(count)) return
    const focused = document.activeElement
    prevButton.disabled = shown === 0
    nextButton.disabled = shown === count - 1
    if (focused?.disabled && (focused === prevButton || focused === nextButton)) openButton.focus({ preventScroll: true })
  }

  // The frame loop stops once nothing is moving; anything that can move it again restarts it
  function wake() {
    if (raf || destroyed || !root.isConnected) return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function setTarget(x) {
    const dir = x >= target ? 1 : -1
    target = clampPosition(x, count)
    wake()
    const i = itemIndexAt(target, count)
    if (i === shown) return
    shown = i
    swapCaption(dir)
    syncArrows()
    onIndexChange(i)
  }

  function step(delta) {
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
    raf = 0
    const dt = last ? Math.max(0, Math.min(0.05, (now - last) / 1000)) : 1
    last = now
    const k = drag?.moved ? 18 : 5.2
    const spring = reducedMotion ? 1 : 1 - Math.exp(-k * dt)
    pos += (target - pos) * spring
    // Half a pixel short of its slot is close enough to stop
    if (Math.abs(target - pos) < settleDistance()) pos = target
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
    const { h, layout } = geom
    const { faceWidth } = sizeAt(pos)
    const safeH = h || 1
    const safeFace = faceWidth || 1
    const follow = 1 - Math.exp(-16 * dt)
    pointer.cx = approach(pointer.cx, pointer.x, follow, 0.05)
    pointer.cy = approach(pointer.cy, pointer.y, follow, 0.05)

    const onCover = pointerKnown && h > 0 && Math.abs(pointer.x - cx) < 0.55 * faceWidth && Math.abs(pointer.y - cy) < 0.55 * h && Math.abs(target - pos) < 0.3
    const goalY = reducedMotion ? 0 : onCover ? (pointer.x - cx) / (0.55 * safeFace) * 9 : pointerKnown ? (pointer.x - cx) / (innerWidth || 1) * 5 : 0
    const goalX = reducedMotion || !onCover ? 0 : -(pointer.y - cy) / (safeH / 2) * 6
    const ease = 1 - Math.exp(-7 * dt)
    tiltY = approach(tiltY, goalY, ease, 1e-3)
    tiltX = approach(tiltX, goalX, ease, 1e-3)

    const liftEase = reducedMotion ? 1 : 1 - Math.exp(-12 * dt)
    const limit = innerWidth / 2 + 1.5 * layout.widestFace
    let hoverSpine = false
    let lifting = false
    tapes.forEach((t, v) => {
      const r = relativePosition(v, pos, count)
      const x = layout.offset(r, pos)
      const visible = Math.abs(x) <= limit
      if (visible !== t.visible) {
        t.el.style.visibility = visible ? '' : 'hidden'
        t.visible = visible
      }
      if (!visible) return
      const lifted = hover === v && Math.abs(r) > 0.5 ? 1 : 0
      if (lifted) hoverSpine = true
      t.lift = approach(t.lift, lifted, liftEase, 1e-3)
      if (t.lift !== lifted) lifting = true
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
      cursor.style.visibility = cursorShowing() ? '' : 'hidden'
      cursor.style.transform = `translate3d(${pointer.cx}px,${pointer.cy}px,0)`
      // Read here rather than on pointerover, since an arrow under the pointer can disable itself
      const overButton = !!pointed?.closest?.('button:not(:disabled), a')
      cursor.dataset.state = overButton ? 'button' : onCover ? 'open' : hoverSpine ? 'spine' : ''
    }
    const moving = drag?.moved || pos !== target || lifting || tiltX !== goalX || tiltY !== goalY
      || pointer.cx !== pointer.x || pointer.cy !== pointer.y
    if (moving && !destroyed && root.isConnected) raf = requestAnimationFrame(tick)
  }

  function onPointerMove(e) {
    pointer.x = e.clientX
    pointer.y = e.clientY
    if (!pointerKnown) {
      pointer.cx = pointer.x
      pointer.cy = pointer.y
      pointerKnown = true
    }
    pointerInside = e.target instanceof Node && root.contains(e.target)
    lastPointer = { x: pointer.x, y: pointer.y, inside: pointerInside }
    syncCursor()
    wake()
    if (!drag || e.pointerId !== drag.pointerId) return
    // A button released outside the window sent no pointerup
    if (e.buttons === 0) {
      onPointerUp(e)
      return
    }
    const dx = e.clientX - drag.x0
    if (!drag.moved && Math.abs(dx) > 5) drag.moved = true
    if (drag.moved) setTarget(geom.layout.moveBy(drag.t0, -dx))
  }

  // Ends the drag for its own pointer's release or cancel, or for anything without a pointer (a blur)
  function onPointerUp(e) {
    if (!drag || (e && 'pointerId' in e && e.pointerId !== drag.pointerId)) return
    if (drag.moved) {
      setTarget(Math.round(target))
      suppressClick = true
      setTimeout(() => { suppressClick = false }, 60)
    }
    drag = null
  }

  // On a narrow screen the rail scrolls sideways, with the active tab in the middle of it
  function centreActiveTab() {
    const rail = root.querySelector('.shelf-rail')
    const tab = rail?.querySelector('.shelf-tab.active')
    if (tab) rail.scrollLeft = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2
  }

  function onResize() {
    geom = measure()
    centreActiveTab()
    wake()
  }

  // The container can change size without the window doing so (header fonts settling, the setup
  // banner), and can report 0 until laid out; the first real size is measured.
  const sizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(entries => {
      const { width, height } = entries.at(-1).contentRect
      if (width || height) onResize()
    })
    : null

  wrap.addEventListener('pointerdown', e => {
    if (e.button > 0) return
    // A second finger leaves the drag alone. A new primary press means every earlier touch has
    // ended, even one whose pointerup and pointercancel were lost, so it settles and replaces that drag.
    // A mouse event without isPrimary counts as primary.
    if (drag) {
      if (e.isPrimary === false) return
      if (drag.moved) setTarget(Math.round(target))
    }
    drag = { pointerId: e.pointerId, x0: e.clientX, t0: target, moved: false }
    wake()
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
    setTarget(geom.layout.moveBy(target, delta * unit * 0.5))
    clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => setTarget(Math.round(target)), 160)
  }, { passive: false })
  root.addEventListener('pointerleave', () => {
    pointerInside = false
    if (lastPointer) lastPointer.inside = false
    syncCursor()
    wake()
  })
  root.addEventListener('pointerover', e => {
    pointed = e.target
    const tape = e.target.closest?.('.tape')
    hover = tape ? tapes.findIndex(t => t.el === tape) : -1
    wake()
  })
  stage.addEventListener('pointerleave', () => {
    hover = -1
    wake()
  })
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
  window.addEventListener('blur', onPointerUp)
  if (sizeObserver) sizeObserver.observe(root)
  else window.addEventListener('resize', onResize)

  items.forEach(book => {
    resolveCover(book).then(url => {
      if (!url || destroyed) return
      tapes.forEach(t => {
        if (t.el.dataset.id !== String(book.id)) return
        t.cover.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`
        t.cover.classList.add('has-image')
      })
      wake()
    })
  })

  centreActiveTab()
  syncCursor()
  syncArrows()
  tick(performance.now())
  // The mount can run ahead of layout, so the loop goes on to draw at least one real frame
  wake()

  return {
    step,
    open,
    centreRect,
    // Whether a press or drag on the stage is under way
    dragging: () => drag !== null,
    // Whether the carousel is still travelling to its slot, as after a step or a released drag
    gliding: () => pos !== target,
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      clearTimeout(wheelTimer)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('blur', onPointerUp)
      window.removeEventListener('resize', onResize)
      sizeObserver?.disconnect()
    },
  }
}
