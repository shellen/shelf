#!/usr/bin/env node
/**
 * Generate a strong password for SHELF_PASSWORD.
 * Run with: npm run password [-- options]
 *
 * Options:
 *   --length N   how many characters (default 32, minimum 16)
 *   --quiet      print only the password, for piping
 *
 * Examples:
 *   npm run password
 *   npm run password -- --length 48
 *   npm run password -- --quiet | vercel env add SHELF_PASSWORD production
 */

import crypto from 'crypto'

// Unambiguous and free of shell metacharacters, so the password survives being
// pasted into a dashboard field or piped through a shell without quoting games.
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_'
const DEFAULT_LENGTH = 32
const MIN_LENGTH = 16

export function generatePassword(length = DEFAULT_LENGTH) {
  if (!Number.isInteger(length) || length < MIN_LENGTH) {
    throw new Error(`length must be a whole number of at least ${MIN_LENGTH}`)
  }
  // randomInt rejects biased samples internally, so every character is equally
  // likely -- taking bytes modulo the alphabet size would quietly favour some.
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)]
  return out
}

export function entropyBits(length) {
  return Math.floor(length * Math.log2(ALPHABET.length))
}

export function parseArgs(argv) {
  const args = { length: DEFAULT_LENGTH, quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--quiet' || arg === '-q') {
      args.quiet = true
    } else if (arg === '--length' || arg === '-n') {
      const value = Number(argv[++i])
      if (!Number.isInteger(value)) throw new Error('--length needs a whole number')
      args.length = value
    } else if (arg.startsWith('--length=')) {
      const value = Number(arg.slice('--length='.length))
      if (!Number.isInteger(value)) throw new Error('--length needs a whole number')
      args.length = value
    } else {
      throw new Error(`unknown option: ${arg}`)
    }
  }
  return args
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(`${e.message}\nUsage: npm run password -- [--length N] [--quiet]`)
    process.exit(1)
  }

  let password
  try {
    password = generatePassword(args.length)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }

  if (args.quiet) {
    // A consumer that stops reading early (`| head -c 8`) closes the pipe under
    // us; that is the reader's business, not a failure worth a stack trace.
    process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
    process.stdout.write(password)
    return
  }

  console.log(`
  ${password}

  ${args.length} characters, about ${entropyBits(args.length)} bits of entropy.

  Set it on Vercel, along with the email you want to sign in with:

    printf '%s' 'you@example.com' | vercel env add SHELF_OWNER_EMAIL production
    printf '%s' '${password}' | vercel env add SHELF_PASSWORD production
    vercel --prod

  The redeploy is required: environment changes do not reach an existing build.
  Store the password in a password manager -- nothing here can recover it later.
`)
}

if (process.argv[1] === new URL(import.meta.url).pathname) main()
