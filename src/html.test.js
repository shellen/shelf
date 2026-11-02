// ABOUTME: Tests for the shared HTML escaping helper.
// ABOUTME: Covers markup characters, both quote styles, and empty values.

import { describe, it, expect } from 'vitest'
import { esc } from './html.js'

describe('esc', () => {
  it('escapes markup and both quote styles', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })

  it('renders null and undefined as empty text', () => {
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
  })

  it('stringifies numbers', () => {
    expect(esc(1965)).toBe('1965')
    expect(esc(0)).toBe('0')
  })
})
