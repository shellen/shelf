// ABOUTME: Tests for the RFC-4180 CSV parser.
import { describe, it, expect } from 'vitest'
import { parseCsv } from './csv.js'

describe('parseCsv', () => {
  it('maps rows to objects keyed by header', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }])
  })
  it('handles quoted fields with commas', () => {
    expect(parseCsv('a,b\n"x, y",2')[0].a).toBe('x, y')
  })
  it('handles embedded newlines in quoted fields', () => {
    expect(parseCsv('a,b\n"line1\nline2",2')[0].a).toBe('line1\nline2')
  })
  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')[0].a).toBe('say "hi"')
  })
  it('handles CRLF line endings and trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }])
  })
  it('keeps Excel-armored values intact for later cleaning', () => {
    expect(parseCsv('isbn\n"=""0143127741"""')[0].isbn).toBe('="0143127741"')
  })
})
