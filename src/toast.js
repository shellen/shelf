// ABOUTME: The single toast slot: brief messages that clear after 3 seconds, and one progress
// ABOUTME: message that stays and updates in place, returning whenever a brief message ends.

import { esc } from './html.js'

const BRIEF_MS = 3000

// Set while a brief toast is showing
let briefTimer = null
// The progress toast's text, or null when there is none
let progressMessage = null

// Toasts render into their own root so they never disturb focus or form state. Brief toasts go in
// a status region that stays in the page, so screen readers announce each one; the progress toast
// sits beside it, so its updates every few seconds are not announced.
function toastSlots() {
  let root = document.getElementById('toast-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'toast-root'
    root.innerHTML = '<div role="status"></div><div></div>'
    document.body.appendChild(root)
  }
  const [brief, progress] = root.children
  return { brief, progress }
}

function toastHtml(message, type = 'success') {
  return message ? `<div class="toast toast-${type}">${esc(message)}</div>` : ''
}

function paintBrief(message, type) {
  const { brief, progress } = toastSlots()
  brief.innerHTML = toastHtml(message, type)
  progress.innerHTML = ''
}

function paintProgress(message) {
  const { brief, progress } = toastSlots()
  brief.innerHTML = ''
  progress.innerHTML = toastHtml(message)
}

export function showToast(message, type = 'success') {
  paintBrief(message, type)
  clearTimeout(briefTimer)
  briefTimer = setTimeout(() => {
    briefTimer = null
    paintProgress(progressMessage)
  }, BRIEF_MS)
}

export function showProgressToast(message) {
  progressMessage = message
  if (!briefTimer) paintProgress(message)
}

export function endProgressToast(message, type = 'success') {
  progressMessage = null
  showToast(message, type)
}
