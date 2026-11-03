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
