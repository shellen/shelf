// ABOUTME: Pure geometry for the shelf carousel: where each slot sits relative to the centre.
// ABOUTME: Positions are in item units; slotOffset converts them to pixels.

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

// Spines sit side by side; the centred face pushes its neighbours apart by its own width
export function slotOffset(r, { spineWidth, faceWidth, gap }) {
  const spread = r <= -1 ? -0.5 : r >= 1 ? 0.5 : (r + Math.sin(Math.PI * r) / Math.PI) / 2
  return r * (spineWidth + gap) + (faceWidth - spineWidth + 1.6 * gap) * spread
}
