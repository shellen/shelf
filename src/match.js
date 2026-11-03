// ABOUTME: The normalised match key shared by the server's import merge and the browser's music import.
// ABOUTME: Keeps letters, marks and numbers in any script, drops accents from Latin letters, folds case and spacing.

export const normKey = s => String(s || '')
  .normalize('NFKD')
  .replace(/(\p{Script=Latin})[̀-ͯ]+/gu, '$1')
  .normalize('NFC')
  .toLowerCase()
  .replace(/[^\p{L}\p{M}\p{N} ]+/gu, '')
  .replace(/\s+/g, ' ')
  .trim()
