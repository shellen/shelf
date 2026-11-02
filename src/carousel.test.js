// ABOUTME: Tests for the shelf carousel's pure geometry: wrapping, positions and offsets.
// ABOUTME: Positions are in item units; offsets are in pixels for a given spine and face size.

import { describe, it, expect } from 'vitest'
import { wraps, slotCount, positionFor, relativePosition, itemIndexAt, clampPosition, faceOut, slotOffset } from './carousel.js'

describe('wrapping', () => {
  it('wraps lists of eight or more by laying three copies end to end', () => {
    expect(wraps(8)).toBe(true)
    expect(slotCount(10)).toBe(30)
  })

  it('does not wrap short lists', () => {
    expect(wraps(7)).toBe(false)
    expect(slotCount(3)).toBe(3)
  })

  it('starts on the middle copy when wrapping', () => {
    expect(positionFor(2, 10)).toBe(12)
    expect(positionFor(2, 5)).toBe(2)
  })
})

describe('relativePosition', () => {
  it('measures signed distance from the current position', () => {
    expect(relativePosition(10, 10, 10)).toBe(0)
    expect(relativePosition(11, 10, 10)).toBe(1)
    expect(relativePosition(9, 10, 10)).toBe(-1)
  })

  it('takes the shortest way round a wrapping list', () => {
    expect(relativePosition(29, 0, 10)).toBe(-1)
    expect(relativePosition(0, 29, 10)).toBe(1)
  })

  it('is a plain difference for short lists', () => {
    expect(relativePosition(3, 1, 5)).toBe(2)
  })
})

describe('itemIndexAt', () => {
  it('maps a wrapping position back to an item', () => {
    expect(itemIndexAt(13.4, 10)).toBe(3)
    expect(itemIndexAt(-1, 10)).toBe(9)
  })

  it('clamps for short lists', () => {
    expect(itemIndexAt(7, 5)).toBe(4)
    expect(itemIndexAt(-2, 5)).toBe(0)
  })
})

describe('clampPosition', () => {
  it('keeps short lists in range and leaves wrapping lists alone', () => {
    expect(clampPosition(9, 5)).toBe(4)
    expect(clampPosition(-3, 5)).toBe(0)
    expect(clampPosition(99, 10)).toBe(99)
  })
})

describe('faceOut', () => {
  it('is fully face-out at the centre and spine-out a slot away', () => {
    expect(faceOut(0)).toBe(1)
    expect(faceOut(1)).toBe(0)
    expect(faceOut(-2)).toBe(0)
    expect(faceOut(-0.5)).toBe(0.5)
  })
})

describe('slotOffset', () => {
  const size = { spineWidth: 20, faceWidth: 100, gap: 2 }

  it('puts the centre at zero', () => {
    expect(slotOffset(0, size)).toBe(0)
  })

  it('opens a gap the width of the face around the centre', () => {
    expect(slotOffset(1, size)).toBeCloseTo(63.6)
    expect(slotOffset(-1, size)).toBeCloseTo(-63.6)
  })

  it('eases the gap open smoothly between the centre and its neighbours', () => {
    expect(slotOffset(0.5, size)).toBeCloseTo(45.04)
    expect(slotOffset(-0.5, size)).toBeCloseTo(-slotOffset(0.5, size))
  })

  it('packs further spines side by side', () => {
    expect(slotOffset(2, size) - slotOffset(1, size)).toBeCloseTo(22)
  })
})
