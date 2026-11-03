// ABOUTME: Tests for the shelf view's markup and its carousel controller under happy-dom.
// ABOUTME: Motion is not asserted; caption, index reporting, input wiring and covers are.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderShelfView, mountShelf } from './shelf.js'

const books = n => Array.from({ length: n }, (_, i) => ({
  id: `b${i}`, title: `Book ${i}`, author: `Author ${i}`, tags: [], rating: null, dateRead: null, year: 2000 + i,
}))
const group = (items, key = 'reading', label = 'Reading') => ({ key, label, items })
const text = sel => document.querySelector(sel)?.textContent
const caption = () => text('.shelf-caption-title')

let control = null
function mountWith(items, index = 0, handlers = {}) {
  document.body.innerHTML = renderShelfView({ groups: [group(items)], activeKey: 'reading', index, total: 81, canAdd: false })
  control = mountShelf(document.querySelector('.shelf-view'), { items, index, reducedMotion: true, ...handlers })
  return control
}

// Holds animation frames back so a test can run them at a time it chooses.
function holdFrames() {
  let pending = null
  let lastId = 0
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    pending = { id: ++lastId, callback }
    return lastId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
    if (pending?.id === id) pending = null
  })
  const run = time => {
    const { callback } = pending
    pending = null
    callback(time)
  }
  return {
    run,
    scheduled: () => pending !== null,
    requests: () => request.mock.calls.length,
    // Runs frames 16ms apart until the loop stops asking for them, or gives up after 500
    settle(from = performance.now()) {
      for (let k = 1; k <= 500 && pending; k++) run(from + k * 16)
    },
  }
}

afterEach(() => {
  control?.destroy()
  control = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('renderShelfView', () => {
  it('lists every group in the rail with its count and marks the active one', () => {
    document.body.innerHTML = renderShelfView({
      groups: [group(books(2)), group(books(3), 'favorites', 'Favorites')],
      activeKey: 'favorites', index: 0, total: 81, canAdd: false,
    })
    const tabs = [...document.querySelectorAll('[data-shelf-group]')]
    expect(tabs.map(t => t.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Reading 2', 'Favorites 3'])
    expect(document.querySelector('.shelf-tab.active').dataset.shelfGroup).toBe('favorites')
    expect(tabs.map(t => t.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    expect(document.querySelector('.shelf-stage').getAttribute('aria-hidden')).toBe('true')
  })

  it('captions the item with its short title, creator, state and stars', () => {
    const dune = { id: 'd', title: 'Dune: Deluxe Edition', author: 'Frank Herbert', tags: ['currently-reading'], rating: 4.5 }
    document.body.innerHTML = renderShelfView({ groups: [group([dune])], activeKey: 'reading', index: 0, total: 81, canAdd: false })
    expect(caption()).toBe('Dune')
    expect(text('.shelf-caption-line')).toBe('Frank Herbert · Reading')
    expect(text('.shelf-caption-stars')).toBe('★★★★½')
  })

  it('counts the group and the library in the footer', () => {
    document.body.innerHTML = renderShelfView({ groups: [group(books(2))], activeKey: 'reading', index: 0, total: 81, canAdd: false })
    expect(text('.shelf-foot')).toBe('2 in Reading · 81 in the library')
  })

  it('falls back to the first group when the active key is unknown', () => {
    document.body.innerHTML = renderShelfView({ groups: [group(books(2))], activeKey: 'gone', index: 5, total: 2, canAdd: false })
    expect(document.querySelector('.shelf-tab.active').dataset.shelfGroup).toBe('reading')
    expect(caption()).toBe('Book 1')
  })

  it('renders item data as text', () => {
    const hostile = { id: 'h', title: '<b>Bold</b>', author: '<i>x</i>', tags: [] }
    document.body.innerHTML = renderShelfView({ groups: [group([hostile])], activeKey: 'reading', index: 0, total: 1, canAdd: false })
    expect(caption()).toBe('<b>Bold</b>')
    expect(document.querySelector('.shelf-caption b')).toBeNull()
  })

  it('shows an empty shelf, offering Add Media only when it can', () => {
    document.body.innerHTML = renderShelfView({ groups: [], activeKey: '', index: 0, total: 0, canAdd: true })
    expect(text('.shelf-empty')).toContain('Nothing on this shelf yet.')
    expect(document.querySelector('.shelf-empty [data-action="add-book"]')).not.toBeNull()
    document.body.innerHTML = renderShelfView({ groups: [], activeKey: '', index: 0, total: 0, canAdd: false })
    expect(document.querySelector('[data-action="add-book"]')).toBeNull()
  })
})

describe('mountShelf', () => {
  it('lays three copies of a long list and one copy of a short one', () => {
    mountWith(books(10))
    expect(document.querySelectorAll('.tape')).toHaveLength(30)
    control.destroy()
    mountWith(books(3))
    expect(document.querySelectorAll('.tape')).toHaveLength(3)
  })

  it('steps the caption and reports the new index', () => {
    const onIndexChange = vi.fn()
    mountWith(books(10), 0, { onIndexChange })
    control.step(1)
    expect(caption()).toBe('Book 1')
    expect(onIndexChange).toHaveBeenCalledWith(1)
  })

  it('wraps backwards past the start of a long list', () => {
    mountWith(books(10))
    control.step(-1)
    expect(caption()).toBe('Book 9')
  })

  it('stops at the ends of a short list', () => {
    const onIndexChange = vi.fn()
    mountWith(books(3), 0, { onIndexChange })
    control.step(-1)
    expect(caption()).toBe('Book 0')
    expect(onIndexChange).not.toHaveBeenCalled()
  })

  describe('controls', () => {
    const openName = () => document.querySelector('.shelf-open').getAttribute('aria-label')
    const prev = () => document.querySelector('.shelf-prev')
    const next = () => document.querySelector('.shelf-next')

    it('names the open button after the centred item', () => {
      mountWith(books(10), 2)
      expect(openName()).toBe('Open Book 2')
      control.step(1)
      expect(openName()).toBe('Open Book 3')
    })

    it('names the open button in its markup', () => {
      document.body.innerHTML = renderShelfView({ groups: [group(books(3))], activeKey: 'reading', index: 1, total: 3, canAdd: false })
      expect(openName()).toBe('Open Book 1')
    })

    it('disables the arrow that cannot move a short list', () => {
      mountWith(books(3))
      expect([prev().disabled, next().disabled]).toEqual([true, false])
      control.step(1)
      expect([prev().disabled, next().disabled]).toEqual([false, false])
      control.step(1)
      expect([prev().disabled, next().disabled]).toEqual([false, true])
      control.step(-2)
      expect([prev().disabled, next().disabled]).toEqual([true, false])
    })

    it('disables neither arrow on a list that wraps', () => {
      mountWith(books(10))
      expect([prev().disabled, next().disabled]).toEqual([false, false])
    })

    it('shows the button cursor over an arrow only while it can move', () => {
      const frames = holdFrames()
      mountWith(books(3))
      const state = () => document.querySelector('.shelf-cursor').dataset.state
      next().dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
      frames.settle()
      expect(state()).toBe('button')
      prev().dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
      frames.settle()
      expect(state()).toBe('')
    })

    it('hands focus to the open button when the focused arrow runs out of list', () => {
      mountWith(books(3), 1)
      next().focus()
      next().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
      expect(next().disabled).toBe(true)
      expect(document.activeElement).toBe(document.querySelector('.shelf-open'))
    })
  })

  it('starts on the given index', () => {
    mountWith(books(10), 4)
    expect(caption()).toBe('Book 4')
  })

  it('wires the arrow buttons and the open button', () => {
    const onOpen = vi.fn()
    mountWith(books(10), 0, { onOpen })
    document.querySelector('[data-shelf-step="1"]').click()
    expect(caption()).toBe('Book 1')
    document.querySelector('[data-shelf-open]').click()
    expect(onOpen).toHaveBeenCalledWith(1, expect.anything())
  })

  it('applies a resolved cover to every copy of that item', async () => {
    const resolveCover = book => Promise.resolve(book.id === 'b0' ? 'https://covers.example/b0.jpg' : null)
    mountWith(books(10), 0, { resolveCover })
    await new Promise(r => setTimeout(r, 0))
    const covers = [...document.querySelectorAll('.tape[data-id="b0"] .tape-cover')]
    expect(covers).toHaveLength(3)
    expect(covers.every(c => c.classList.contains('has-image'))).toBe(true)
    expect(document.querySelector('.tape[data-id="b1"] .tape-cover').classList.contains('has-image')).toBe(false)
  })

  it('stops its animation loop when destroyed', () => {
    const frames = holdFrames()
    mountWith(books(10))
    expect(frames.scheduled()).toBe(true)
    control.destroy()
    expect(frames.scheduled()).toBe(false)
  })

  it('asks for no frame once destroyed, whatever moves', () => {
    const frames = holdFrames()
    mountWith(books(10))
    control.destroy()
    const requests = frames.requests()
    control.step(1)
    document.querySelector('.shelf-view').dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 20 }))
    expect(frames.requests()).toBe(requests)
    expect(frames.scheduled()).toBe(false)
  })

  describe('at rest', () => {
    it('stops asking for frames once it has settled', () => {
      const frames = holdFrames()
      mountWith(books(10), 0, { reducedMotion: false })
      expect(frames.scheduled()).toBe(true)
      frames.settle()
      expect(frames.scheduled()).toBe(false)
    })

    it('settles again after a step glides to its slot', () => {
      const frames = holdFrames()
      mountWith(books(10), 0, { reducedMotion: false })
      frames.settle()
      control.step(1)
      expect(frames.scheduled()).toBe(true)
      frames.settle()
      expect(frames.scheduled()).toBe(false)
    })

    it('wakes for a pointer moving over it', () => {
      const frames = holdFrames()
      mountWith(books(10))
      frames.settle()
      document.querySelector('.shelf-view').dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 20 }))
      expect(frames.scheduled()).toBe(true)
    })

    it('wakes for a pointer entering a spine and for one leaving the shelf', () => {
      const frames = holdFrames()
      mountWith(books(10))
      frames.settle()
      document.querySelectorAll('.tape')[12].dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
      expect(frames.scheduled()).toBe(true)
      frames.settle()
      document.querySelector('.shelf-stage').dispatchEvent(new Event('pointerleave'))
      expect(frames.scheduled()).toBe(true)
      frames.settle()
      document.querySelector('.shelf-view').dispatchEvent(new Event('pointerleave'))
      expect(frames.scheduled()).toBe(true)
    })

    it('wakes for a wheel turn', () => {
      const frames = holdFrames()
      mountWith(books(10))
      frames.settle()
      const turn = Object.assign(new Event('wheel', { cancelable: true, bubbles: true }), { deltaY: 1.2, deltaX: 0, deltaMode: 0 })
      document.querySelector('.shelf-view').dispatchEvent(turn)
      expect(frames.scheduled()).toBe(true)
    })

    it('wakes for a drag starting on the stage', () => {
      const frames = holdFrames()
      mountWith(books(10))
      frames.settle()
      document.querySelector('.shelf-stage-wrap').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }))
      expect(frames.scheduled()).toBe(true)
    })

    it('wakes when a cover arrives', async () => {
      const frames = holdFrames()
      let arrive
      const resolveCover = book => book.id === 'b0' ? new Promise(r => { arrive = r }) : Promise.resolve(null)
      mountWith(books(10), 0, { resolveCover })
      await new Promise(r => setTimeout(r, 0))
      frames.settle()
      arrive('https://covers.example/b0.jpg')
      await new Promise(r => setTimeout(r, 0))
      expect(frames.scheduled()).toBe(true)
    })
  })

  describe('measuring its own box', () => {
    const realResizeObserver = globalThis.ResizeObserver
    let observers
    let shelfHeight

    class FakeResizeObserver {
      constructor(callback) {
        this.callback = callback
        this.observe = vi.fn()
        this.disconnect = vi.fn()
        observers.push(this)
      }
    }
    const fire = (width, height) => observers[0].callback([{ contentRect: { width, height } }])
    const stageHeight = () => document.querySelector('.shelf-stage').style.getPropertyValue('--h')

    beforeEach(() => {
      observers = []
      shelfHeight = 600
      globalThis.ResizeObserver = FakeResizeObserver
      // happy-dom does no layout, so the probe that resolves --shelf-h reports the height set here
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        const height = this.style.height === 'var(--shelf-h)' ? shelfHeight : 0
        return { width: 0, height, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0 }
      })
    })

    afterEach(() => {
      globalThis.ResizeObserver = realResizeObserver
    })

    it('observes the shelf root', () => {
      mountWith(books(10))
      expect(observers).toHaveLength(1)
      expect(observers[0].observe).toHaveBeenCalledWith(document.querySelector('.shelf-view'))
    })

    it('measures again when the root changes size', () => {
      mountWith(books(10))
      expect(stageHeight()).toBe('600px')
      shelfHeight = 480
      fire(1200, 800)
      expect(stageHeight()).toBe('480px')
    })

    it('waits for the root to have a size', () => {
      mountWith(books(10))
      shelfHeight = 480
      fire(0, 0)
      expect(stageHeight()).toBe('600px')
      fire(1200, 800)
      expect(stageHeight()).toBe('480px')
    })

    it('wakes to draw at the new size', () => {
      const frames = holdFrames()
      mountWith(books(10))
      frames.settle()
      shelfHeight = 480
      fire(1200, 800)
      expect(frames.scheduled()).toBe(true)
    })

    it('disconnects the observer when destroyed', () => {
      mountWith(books(10))
      control.destroy()
      expect(observers[0].disconnect).toHaveBeenCalled()
    })

    it('measures on window resize when there is no ResizeObserver', () => {
      globalThis.ResizeObserver = undefined
      mountWith(books(10))
      shelfHeight = 480
      window.dispatchEvent(new Event('resize'))
      expect(stageHeight()).toBe('480px')
    })
  })

  it('keeps every spine visible when a frame is stamped earlier than the mount', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const frames = holdFrames()
    mountWith(books(10), 0, { reducedMotion: true })
    frames.run(997)
    const hidden = [...document.querySelectorAll('.tape')].filter(t => t.style.visibility === 'hidden')
    expect(hidden).toHaveLength(0)
    expect(control.centreRect()).not.toBeNull()
  })

  it('centres a spine clicked mid-glide instead of opening the item being glided to', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const frames = holdFrames()
    const onOpen = vi.fn()
    mountWith(books(10), 0, { reducedMotion: false, onOpen })
    control.step(1)
    control.step(1)
    control.step(1)
    frames.run(1016)
    const drawnAtCentre = document.querySelectorAll('.tape[data-id="b0"]')[1]
    drawnAtCentre.click()
    expect(onOpen).not.toHaveBeenCalled()
    expect(caption()).toBe('Book 0')
  })

  it('opens the centred item when its spine is clicked once settled', () => {
    const onOpen = vi.fn()
    mountWith(books(10), 2, { onOpen })
    document.querySelectorAll('.tape[data-id="b2"]')[1].click()
    expect(onOpen).toHaveBeenCalledWith(2, expect.anything())
  })

  it('starts the cursor where the pointer last was', () => {
    mountWith(books(10))
    document.querySelector('.shelf-view').dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 20 }))
    control.destroy()
    mountWith(books(10))
    expect(document.querySelector('.shelf-cursor').style.transform).toContain('10px,20px')
    expect(document.querySelector('.shelf-cursor').style.visibility).toBe('')
  })

  it('hides the cursor until a pointer has been seen', async () => {
    vi.resetModules()
    const frames = holdFrames()
    const fresh = await import('./shelf.js')
    document.body.innerHTML = fresh.renderShelfView({ groups: [group(books(10))], activeKey: 'reading', index: 0, total: 81, canAdd: false })
    control = fresh.mountShelf(document.querySelector('.shelf-view'), { items: books(10), reducedMotion: true })
    const cursor = document.querySelector('.shelf-cursor')
    expect(cursor.style.visibility).toBe('hidden')
    document.querySelector('.shelf-view').dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 30, clientY: 40 }))
    frames.run(performance.now() + 16)
    expect(cursor.style.visibility).toBe('')
    expect(cursor.style.transform).toContain('30px,40px')
  })

  describe('with the pointer', () => {
    const moveOver = (el, x, y) => el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }))

    async function mountFresh({ reducedMotion = true } = {}) {
      vi.resetModules()
      const frames = holdFrames()
      const fresh = await import('./shelf.js')
      document.body.innerHTML = '<div class="header"></div>' + fresh.renderShelfView({ groups: [group(books(10))], activeKey: 'reading', index: 0, total: 81, canAdd: false })
      const view = document.querySelector('.shelf-view')
      control = fresh.mountShelf(view, { items: books(10), reducedMotion })
      return { view, frames }
    }

    it('marks the shelf only while the custom cursor is showing', async () => {
      const { view, frames } = await mountFresh()
      const cursor = document.querySelector('.shelf-cursor')
      expect(view.classList.contains('has-pointer')).toBe(false)
      moveOver(view, 30, 40)
      expect(view.classList.contains('has-pointer')).toBe(true)
      frames.run(performance.now() + 16)
      expect(cursor.style.visibility).toBe('')
      view.dispatchEvent(new Event('pointerleave'))
      expect(view.classList.contains('has-pointer')).toBe(false)
      frames.run(performance.now() + 32)
      expect(cursor.style.visibility).toBe('hidden')
      moveOver(view, 50, 60)
      expect(view.classList.contains('has-pointer')).toBe(true)
    })

    it('drops the custom cursor when the pointer moves onto the header', async () => {
      const { view } = await mountFresh()
      moveOver(view, 30, 40)
      moveOver(document.querySelector('.header'), 30, 10)
      expect(view.classList.contains('has-pointer')).toBe(false)
    })

    it('keeps the custom cursor across a re-render while the pointer is on the shelf', async () => {
      const { view } = await mountFresh()
      moveOver(view, 30, 40)
      control.destroy()
      document.body.innerHTML = '<div class="header"></div>' + renderShelfView({ groups: [group(books(10))], activeKey: 'reading', index: 0, total: 81, canAdd: false })
      const again = document.querySelector('.shelf-view')
      control = (await import('./shelf.js')).mountShelf(again, { items: books(10), reducedMotion: true })
      expect(again.classList.contains('has-pointer')).toBe(true)
    })

    const centreRotation = () => document.querySelectorAll('.tape[data-id="b0"]')[1].style.transform.match(/rotateY\(([-\d.]+)deg\)/)[1]

    it('tilts the centred cover towards the pointer', async () => {
      const { view, frames } = await mountFresh({ reducedMotion: false })
      moveOver(view, 900, 40)
      frames.run(performance.now() + 1000)
      expect(Number(centreRotation())).not.toBe(-90)
    })

    it('holds the cover still under reduced motion', async () => {
      const { view, frames } = await mountFresh({ reducedMotion: true })
      moveOver(view, 900, 40)
      frames.run(performance.now() + 1000)
      expect(Number(centreRotation())).toBe(-90)
    })
  })

  it('leaves ctrl+wheel to the browser', () => {
    mountWith(books(10))
    // happy-dom's WheelEvent drops ctrlKey, so the modifier is set on a plain event
    const event = Object.assign(new Event('wheel', { cancelable: true, bubbles: true }), { deltaY: 400, deltaX: 0, deltaMode: 0, ctrlKey: true })
    document.querySelector('.shelf-view').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(caption()).toBe('Book 0')
  })

  it('starts inside the list when given an out-of-range index', () => {
    mountWith(books(3), 9)
    expect(caption()).toBe('Book 2')
    control.step(-1)
    expect(caption()).toBe('Book 1')
  })

  it('centres rather than opens a spine clicked while a wheel flick rests between slots', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const frames = holdFrames()
    const onOpen = vi.fn()
    mountWith(books(10), 0, { reducedMotion: false, onOpen })
    const flick = Object.assign(new Event('wheel', { cancelable: true, bubbles: true }), { deltaY: 1.2, deltaX: 0, deltaMode: 0 })
    document.querySelector('.shelf-view').dispatchEvent(flick)
    frames.run(1050)
    document.querySelectorAll('.tape[data-id="b0"]')[1].click()
    expect(onOpen).not.toHaveBeenCalled()
    expect(caption()).toBe('Book 0')
  })
})
