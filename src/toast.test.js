// ABOUTME: Tests for the toast slot: brief messages that clear themselves, and a progress
// ABOUTME: message that stays, updates in place, and comes back after a brief one.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let toast

beforeEach(async () => {
  vi.useFakeTimers()
  document.body.innerHTML = ''
  vi.resetModules()
  toast = await import('./toast.js')
})

afterEach(() => {
  vi.useRealTimers()
})

const shown = () => document.querySelector('#toast-root .toast')

describe('showToast', () => {
  it('shows a message and clears it after 3 seconds', () => {
    toast.showToast('Saved')
    expect(shown().textContent).toBe('Saved')
    expect(shown().classList.contains('toast-success')).toBe(true)
    vi.advanceTimersByTime(2999)
    expect(shown().textContent).toBe('Saved')
    vi.advanceTimersByTime(1)
    expect(shown()).toBeNull()
  })

  it('shows an error in the error style and escapes the message', () => {
    toast.showToast('<b>Save failed</b>', 'error')
    expect(shown().classList.contains('toast-error')).toBe(true)
    expect(shown().textContent).toBe('<b>Save failed</b>')
    expect(shown().querySelector('b')).toBeNull()
  })

  it('replaces the message showing and restarts the 3 seconds', () => {
    toast.showToast('Saved')
    vi.advanceTimersByTime(2000)
    toast.showToast('Notes saved')
    vi.advanceTimersByTime(2000)
    expect(shown().textContent).toBe('Notes saved')
    expect(document.querySelectorAll('.toast')).toHaveLength(1)
  })
})

describe('showProgressToast', () => {
  it('stays until it is ended, updating in place', () => {
    toast.showProgressToast('Finding covers 0 / 2 · about 1 min left')
    vi.advanceTimersByTime(10_000)
    expect(shown().textContent).toBe('Finding covers 0 / 2 · about 1 min left')
    toast.showProgressToast('Finding covers 1 / 2 · about 1 min left')
    expect(shown().textContent).toBe('Finding covers 1 / 2 · about 1 min left')
    expect(document.querySelectorAll('.toast')).toHaveLength(1)
  })

  it('comes back after a brief toast shown over it', () => {
    toast.showProgressToast('Finding covers 3 / 9 · about 1 min left')
    toast.showToast('Saved')
    expect(shown().textContent).toBe('Saved')
    vi.advanceTimersByTime(3000)
    expect(shown().textContent).toBe('Finding covers 3 / 9 · about 1 min left')
  })

  it('waits for a brief toast to finish before showing an update', () => {
    toast.showProgressToast('Finding covers 3 / 9 · about 1 min left')
    toast.showToast('Saved')
    toast.showProgressToast('Finding covers 4 / 9 · about 1 min left')
    expect(shown().textContent).toBe('Saved')
    vi.advanceTimersByTime(3000)
    expect(shown().textContent).toBe('Finding covers 4 / 9 · about 1 min left')
  })

  it('first appears once a brief toast already showing has finished', () => {
    toast.showToast('Imported: 2 added, 0 filled, 0 skipped')
    toast.showProgressToast('Finding covers 0 / 2 · about 1 min left')
    expect(shown().textContent).toBe('Imported: 2 added, 0 filled, 0 skipped')
    vi.advanceTimersByTime(3000)
    expect(shown().textContent).toBe('Finding covers 0 / 2 · about 1 min left')
  })
})

describe('endProgressToast', () => {
  it('replaces the progress toast with a brief one that clears like any other', () => {
    toast.showProgressToast('Finding covers 1 / 2 · about 1 min left')
    toast.endProgressToast('Found 2 covers')
    expect(shown().textContent).toBe('Found 2 covers')
    vi.advanceTimersByTime(3000)
    expect(shown()).toBeNull()
  })

  it('does not bring the progress toast back when it ends during a brief one', () => {
    toast.showProgressToast('Finding covers 1 / 2 · about 1 min left')
    toast.showToast('Saved')
    vi.advanceTimersByTime(1000)
    toast.endProgressToast('Found 2 covers')
    vi.advanceTimersByTime(3000)
    expect(shown()).toBeNull()
  })

  it('can end on an error', () => {
    toast.showProgressToast('Finding covers 1 / 9 · about 1 min left')
    toast.endProgressToast('Stopped finding covers', 'error')
    expect(shown().classList.contains('toast-error')).toBe(true)
  })
})

describe('screen reader announcements', () => {
  const announcer = () => document.querySelector('#toast-root [role="status"]')
  const announced = () => announcer().textContent.trim()

  it('announces a brief toast from a status region that is already in the page', () => {
    toast.showToast('Saved')
    const region = announcer()
    expect(announced()).toBe('Saved')
    vi.advanceTimersByTime(3000)
    toast.showToast('Notes saved', 'error')
    expect(announcer()).toBe(region)
    expect(announced()).toBe('Notes saved')
  })

  it('keeps the progress toast out of the status region, so its updates are not announced', () => {
    toast.showProgressToast('Finding covers 1 / 9 · about 1 min left')
    toast.showProgressToast('Finding covers 2 / 9 · about 1 min left')
    expect(shown().textContent).toBe('Finding covers 2 / 9 · about 1 min left')
    expect(shown().closest('[role], [aria-live]')).toBeNull()
    expect(announced()).toBe('')
  })

  it('announces the toast that ends the progress', () => {
    toast.showProgressToast('Finding covers 1 / 2 · about 1 min left')
    toast.endProgressToast('Found 2 covers')
    expect(announced()).toBe('Found 2 covers')
    expect(document.querySelectorAll('.toast')).toHaveLength(1)
  })

  it('shows one toast at a time when a brief one covers the progress', () => {
    toast.showProgressToast('Finding covers 3 / 9 · about 1 min left')
    toast.showToast('Saved')
    expect(document.querySelectorAll('.toast')).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    expect(announced()).toBe('')
    expect(shown().textContent).toBe('Finding covers 3 / 9 · about 1 min left')
  })
})
