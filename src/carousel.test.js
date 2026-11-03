// ABOUTME: Tests for the shelf carousel's pure geometry: wrapping, positions and offsets.
// ABOUTME: Positions are in item units; offsets are in pixels for a given spine and face size.

import { describe, it, expect } from 'vitest'
import { wraps, slotCount, positionFor, relativePosition, itemIndexAt, clampPosition, faceOut, slotOffset, shelfLayout } from './carousel.js'

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

describe('shelfLayout', () => {
  // A book's spine stride is 22 and the room its face opens is 100 - 20 + 3.2 = 83.2;
  // an album's are 12 and 150 - 10 + 3.2 = 143.2
  const BOOK = { spineWidth: 20, faceWidth: 100 }
  const ALBUM = { spineWidth: 10, faceWidth: 150 }
  const GAP = 2
  const POSITIONS = [0, 0.25, 0.5, 0.75, 1, 2.6, 4]
  const RS = [-3, -1.5, -1, -0.6, -0.5, 0, 0.3, 0.5, 1, 2, 3.25]

  describe('offset', () => {
    it('places every slot of a shelf of books where slotOffset does', () => {
      const layout = shelfLayout(Array(5).fill(BOOK), GAP)
      for (const pos of POSITIONS) {
        for (const r of RS) expect(layout.offset(r, pos)).toBeCloseTo(slotOffset(r, { ...BOOK, gap: GAP }), 9)
      }
    })

    it('places every slot of a shelf of albums where slotOffset does at the album size', () => {
      const layout = shelfLayout(Array(5).fill(ALBUM), GAP)
      for (const pos of POSITIONS) {
        for (const r of RS) expect(layout.offset(r, pos)).toBeCloseTo(slotOffset(r, { ...ALBUM, gap: GAP }), 9)
      }
    })

    it('puts the centre at zero wherever it is', () => {
      const layout = shelfLayout([BOOK, ALBUM, BOOK, ALBUM, BOOK], GAP)
      for (const pos of POSITIONS) expect(layout.offset(0, pos)).toBe(0)
    })

    it('opens the room of the centred item\'s own face, and packs each spine by its own width', () => {
      const layout = shelfLayout([ALBUM, ALBUM, BOOK, BOOK, BOOK], GAP)
      // Book 2 centred: half its stride, half its neighbour's, and half its own room
      expect(layout.offset(1, 2)).toBeCloseTo(11 + 11 + 41.6, 9)
      expect(layout.offset(-1, 2)).toBeCloseTo(-(11 + 6 + 41.6), 9)
      expect(layout.offset(2, 2) - layout.offset(1, 2)).toBeCloseTo(22, 9)
      expect(layout.offset(-2, 2) - layout.offset(-1, 2)).toBeCloseTo(-12, 9)
      // Album 1 centred opens its wider face
      expect(layout.offset(1, 1)).toBeCloseTo(6 + 11 + 71.6, 9)
      expect(layout.offset(-1, 1)).toBeCloseTo(-(6 + 6 + 71.6), 9)
    })

    it('blends the room between the two items either side partway through a glide', () => {
      const layout = shelfLayout([BOOK, ALBUM, BOOK, ALBUM, BOOK], GAP)
      // A slot two or more away has the room's full half: the spines from 0.25 to 3, plus half the room
      // at 0.25, where the book's share eases from 1 as the album's face turns out
      const share = 0.75 * 0.75 * (3 - 2 * 0.75)
      const spines = 22 * 0.25 + 12 + 22 + 12 * 0.5
      expect(layout.offset(2.75, 0.25)).toBeCloseTo(spines + (83.2 * share + 143.2 * (1 - share)) / 2, 9)
      // Halfway, each item has half the say
      expect(layout.offset(1.5, 0.5)).toBeCloseTo(12 + 11 + (83.2 + 143.2) / 4, 9)
    })

    it('moves every slot continuously through glides between books and albums', () => {
      const layout = shelfLayout([BOOK, ALBUM, BOOK, ALBUM, BOOK], GAP)
      const step = 0.001
      for (let v = 0; v < 5; v++) {
        for (let pos = 0; pos < 4; pos += step) {
          const jump = Math.abs(layout.offset(v - (pos + step), pos + step) - layout.offset(v - pos, pos))
          expect(jump, `slot ${v} near position ${pos.toFixed(3)}`).toBeLessThan(0.5)
        }
      }
    })

    it('wraps, laying a long shelf out the same at every copy', () => {
      const sizes = [BOOK, ALBUM, BOOK, BOOK, ALBUM, BOOK, BOOK, ALBUM]
      const layout = shelfLayout(sizes, GAP)
      for (const pos of POSITIONS) {
        for (const r of RS) {
          expect(layout.offset(r, pos + 8)).toBeCloseTo(layout.offset(r, pos), 9)
          expect(layout.offset(r, pos + 16)).toBeCloseTo(layout.offset(r, pos), 9)
          expect(layout.offset(r, pos - 8)).toBeCloseTo(layout.offset(r, pos), 9)
        }
      }
      // From the first item, the slot before it is the last album
      expect(layout.offset(-1, 0)).toBeCloseTo(-(6 + 11 + 41.6), 9)
    })
  })

  describe('moveBy', () => {
    it('moves a shelf of books one item per stride', () => {
      const layout = shelfLayout(Array(5).fill(BOOK), GAP)
      expect(layout.moveBy(0, 22)).toBe(1)
      for (const pos of POSITIONS) {
        for (const px of [-70, -22, -5, 0, 7, 22, 61]) expect(layout.moveBy(pos, px)).toBeCloseTo(pos + px / 22, 9)
      }
    })

    it('moves a shelf of albums one item per album stride', () => {
      const layout = shelfLayout(Array(5).fill(ALBUM), GAP)
      expect(layout.moveBy(0, 12)).toBeCloseTo(1, 9)
      expect(layout.moveBy(3, -24)).toBeCloseTo(1, 9)
    })

    it('moves one item for the stride between neighbours on a mixed shelf', () => {
      const layout = shelfLayout([BOOK, ALBUM, BOOK, ALBUM, BOOK], GAP)
      // Half a book's stride and half an album's apart
      expect(layout.moveBy(0, 17)).toBeCloseTo(1, 9)
      expect(layout.moveBy(1, 17)).toBeCloseTo(2, 9)
      expect(layout.moveBy(0, 34)).toBeCloseTo(2, 9)
      expect(layout.moveBy(2, -34)).toBeCloseTo(0, 9)
      // Within a book's stretch a pixel is a 22nd of an item, within an album's a 12th
      expect(layout.moveBy(0, 5.5)).toBeCloseTo(0.25, 9)
      expect(layout.moveBy(1, 3)).toBeCloseTo(1.25, 9)
    })

    it('comes back to where it started when moved back', () => {
      const layout = shelfLayout([BOOK, ALBUM, BOOK, ALBUM, BOOK], GAP)
      for (const pos of POSITIONS) {
        for (const px of [-40, -9, 3, 26]) expect(layout.moveBy(layout.moveBy(pos, px), -px)).toBeCloseTo(pos, 9)
      }
    })

    it('carries on into the next copy of a long shelf', () => {
      const sizes = [BOOK, ALBUM, BOOK, BOOK, ALBUM, BOOK, BOOK, ALBUM]
      const layout = shelfLayout(sizes, GAP)
      expect(layout.moveBy(7, 17)).toBeCloseTo(8, 9)
      expect(layout.moveBy(0, -17)).toBeCloseTo(-1, 9)
      expect(layout.moveBy(2, 5 * 22 + 3 * 12)).toBeCloseTo(10, 9)
    })

    it('moves one item per pixel on a shelf not laid out yet', () => {
      const layout = shelfLayout(Array(5).fill({ spineWidth: 0, faceWidth: 0 }), 0)
      expect(layout.moveBy(3, 7)).toBe(10)
      expect(layout.moveBy(3, -2)).toBe(1)
    })
  })

  it('knows its widest face', () => {
    expect(shelfLayout([BOOK, ALBUM, BOOK], GAP).widestFace).toBe(150)
    expect(shelfLayout([BOOK, BOOK], GAP).widestFace).toBe(100)
  })
})
