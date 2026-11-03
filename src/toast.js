// ABOUTME: The single toast slot: brief messages that clear after 3 seconds, and one progress
// ABOUTME: message that stays and updates in place, returning whenever a brief message ends.

import { esc } from './html.js'

const BRIEF_MS = 3000

// Set while a brief toast is showing
let briefTimer = null
// The progress toast's text, or null when there is none
let progressMessage = null

// Toasts render into their own root so they never disturb focus or form state
function toastRoot() {
  let root = document.getElementById('toast-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'toast-root'
    document.body.appendChild(root)
  }
  return root
}

function paint(root, message, type = 'success') {
  root.innerHTML = message ? `<div class="toast toast-${type}">${esc(message)}</div>` : ''
}

export function showToast(message, type = 'success') {
  const root = toastRoot()
  paint(root, message, type)
  clearTimeout(briefTimer)
  briefTimer = setTimeout(() => {
    briefTimer = null
    paint(root, progressMessage)
  }, BRIEF_MS)
}

export function showProgressToast(message) {
  progressMessage = message
  if (!briefTimer) paint(toastRoot(), message)
}

export function endProgressToast(message, type = 'success') {
  progressMessage = null
  showToast(message, type)
}
