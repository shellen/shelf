// ABOUTME: Pure geometry for the shelf carousel: where each slot sits relative to the centre.
// ABOUTME: Positions are in item units; slotOffset and shelfLayout convert them to pixels.

// Long lists wrap by laying three copies end to end; short ones stop at the ends
export const wraps = count => count >= 8
export const slotCount = count => wraps(count) ? count * 3 : count

export function positionFor(index, count) {
  return wraps(count) ? count + index : index
}

// Signed distance of slot v from position s, the shortest way round when wrapping
export function relativePosition(v, s, count) {
  if (!wraps(count)) return v - s
  const length = count * 3
  let r = ((v - s) % length + length) % length
  if (r > length / 2) r -= length
  return r
}

export function itemIndexAt(x, count) {
  const i = Math.round(x)
  return wraps(count) ? ((i % count) + count) % count : Math.max(0, Math.min(count - 1, i))
}

export function clampPosition(x, count) {
  return wraps(count) ? x : Math.max(0, Math.min(count - 1, x))
}

// 1 when a slot is centred and face-out, easing to 0 one slot away
export function faceOut(r) {
  const x = Math.max(0, 1 - Math.abs(r))
  return x * x * (3 - 2 * x)
}

// How much of the centred face's room lies between the centre and a slot r away:
// none at the centre, easing to half of it a slot away on either side
function spread(r) {
  return r <= -1 ? -0.5 : r >= 1 ? 0.5 : (r + Math.sin(Math.PI * r) / Math.PI) / 2
}

// Spines sit side by side; the centred face pushes its neighbours apart by its own width
export function slotOffset(r, { spineWidth, faceWidth, gap }) {
  return r * (spineWidth + gap) + (faceWidth - spineWidth + 1.6 * gap) * spread(r)
}

const mod = (i, n) => ((i % n) + n) % n

// The geometry of a shelf whose items each have their own spine and face width: `sizes` holds one
// { spineWidth, faceWidth } per item in order, and `gap` sits between spines. Slot j's spine owns the
// stretch of position from j - 0.5 to j + 0.5, so neighbours sit half of each one's stride apart.
// The sizes repeat every `sizes.length` slots, for lists that wrap.
export function shelfLayout(sizes, gap) {
  const count = sizes.length
  const strides = sizes.map(s => s.spineWidth + gap)
  const rooms = sizes.map(s => s.faceWidth - s.spineWidth + 1.6 * gap)
  const starts = [0]
  strides.forEach(w => starts.push(starts.at(-1) + w))
  const total = starts[count]

  // Pixels along the row of spines, from the start of slot 0's stretch to position x
  function along(x) {
    const j = Math.floor(x + 0.5)
    const k = mod(j, count)
    return (j - k) / count * total + starts[k] + strides[k] * (x + 0.5 - j)
  }

  // An item's own value at its slot, handing over to the next item's as that item's face turns out
  function blend(values, pos) {
    const j = Math.floor(pos)
    const t = pos - j
    return values[mod(j, count)] * faceOut(t) + values[mod(j + 1, count)] * faceOut(1 - t)
  }

  // The room the centred face opens
  const room = pos => blend(rooms, pos)
  const faceWidths = sizes.map(s => s.faceWidth)

  // The position whose distance along the row of spines is p: the last stretch starting at or
  // before p, found by halving, and the share of that stretch p reaches into
  function positionAlong(p) {
    const copies = Math.floor(p / total)
    const rest = p - copies * total
    let lo = 0
    let hi = count - 1
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (starts[mid] <= rest) lo = mid
      else hi = mid - 1
    }
    return copies * count + lo - 0.5 + (rest - starts[lo]) / strides[lo]
  }

  return {
    widestFace: Math.max(...faceWidths),
    // The width of the face turned out at position pos
    faceWidthAt: pos => blend(faceWidths, pos),
    // Pixels from the centre to the slot r away from position pos
    offset: (r, pos) => along(pos + r) - along(pos) + room(pos) * spread(r),
    // The position `pixels` further along the row of spines than pos, for a drag or a wheel turn.
    // A shelf not laid out yet has no widths, so it moves one item per pixel.
    moveBy: (pos, pixels) => total > 0 ? positionAlong(along(pos) + pixels) : pos + pixels,
  }
}
