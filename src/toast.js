// ABOUTME: The single toast slot: brief messages that clear themselves after 3 seconds.
// ABOUTME: Toasts render into their own root so they never disturb focus or form state.

import { esc } from './html.js'

let toastTimer = null

export function showToast(message, type = 'success') {
  let root = document.getElementById('toast-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'toast-root'
    document.body.appendChild(root)
  }
  root.innerHTML = `<div class="toast toast-${type}">${esc(message)}</div>`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { root.innerHTML = '' }, 3000)
}
