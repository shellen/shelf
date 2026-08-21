// @vitest-environment node
// ABOUTME: Password generator: shape, argument parsing, and the properties that
// ABOUTME: make the output worth trusting -- unpredictable and unbiased.

import { describe, it, expect } from 'vitest'
import { generatePassword, entropyBits, parseArgs } from './gen-password.js'

describe('generatePassword', () => {
  it('produces the requested length', () => {
    expect(generatePassword(16)).toHaveLength(16)
    expect(generatePassword(64)).toHaveLength(64)
    expect(generatePassword()).toHaveLength(32)
  })

  it('refuses lengths too short to be worth generating', () => {
    expect(() => generatePassword(8)).toThrow(/at least 16/)
    expect(() => generatePassword(15.5)).toThrow(/whole number/)
  })

  it('avoids characters that a shell or a reader would trip over', () => {
    const password = generatePassword(4000)
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/)
    // Ambiguous glyphs are excluded so a transcribed password still works.
    expect(password).not.toMatch(/[01lIO]/)
  })

  it('never repeats itself across many draws', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generatePassword(32)))
    expect(seen.size).toBe(500)
  })

  it('draws characters near-uniformly, so no character is a better guess', () => {
    const counts = new Map()
    for (const ch of generatePassword(60000)) counts.set(ch, (counts.get(ch) || 0) + 1)
    // 59 characters over 60000 draws: ~1017 each. A modulo-biased generator
    // would push the favoured characters roughly 2x above the rest.
    const frequencies = [...counts.values()]
    expect(counts.size).toBe(59)
    expect(Math.max(...frequencies) / Math.min(...frequencies)).toBeLessThan(1.5)
  })
})

describe('entropyBits', () => {
  it('reports the strength of the default length', () => {
    expect(entropyBits(32)).toBe(188)
    expect(entropyBits(48)).toBeGreaterThan(entropyBits(32))
  })
})

describe('parseArgs', () => {
  it('defaults to a 32-character printed password', () => {
    expect(parseArgs([])).toEqual({ length: 32, quiet: false })
  })

  it('accepts both spellings of each option', () => {
    expect(parseArgs(['--length', '48']).length).toBe(48)
    expect(parseArgs(['--length=48']).length).toBe(48)
    expect(parseArgs(['-n', '48']).length).toBe(48)
    expect(parseArgs(['--quiet']).quiet).toBe(true)
    expect(parseArgs(['-q']).quiet).toBe(true)
  })

  it('rejects nonsense rather than guessing at it', () => {
    expect(() => parseArgs(['--length', 'abc'])).toThrow(/whole number/)
    expect(() => parseArgs(['--bogus'])).toThrow(/unknown option/)
  })
})
