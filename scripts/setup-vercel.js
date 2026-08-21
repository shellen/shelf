#!/usr/bin/env node
/**
 * Guided setup for a hosted Shelf: creates the Turso database, sets every
 * environment variable Vercel needs, and deploys.
 *
 * Run with: npm run setup
 *
 * Options:
 *   --db NAME      Turso database name (default: shelf)
 *   --email ADDR   sign-in email; prompted for when omitted
 *   --dry-run      print the plan without running anything
 *   --no-deploy    set everything up but skip the final deploy
 *
 * Requires the Turso and Vercel CLIs, and a project already linked with
 * `vercel link`. Nothing here is destructive to your books: it creates a
 * database and sets variables, and re-running it replaces those variables.
 */

import { spawn } from 'child_process'
import readline from 'readline'
import { generatePassword } from './gen-password.js'

const ENV_TARGET = 'production'

// Values are written to the child's stdin rather than passed as arguments,
// so a password or token never appears in the process list.
export function realExec(cmd, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`${cmd} ${args[0] ?? ''} failed (exit ${code}): ${(stderr || stdout).trim()}`))
    })
    if (input !== undefined) {
      child.stdin.write(input)
      child.stdin.end()
    }
  })
}

export function parseArgs(argv) {
  const args = { dbName: 'shelf', email: null, password: null, dryRun: false, deploy: true }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--no-deploy') args.deploy = false
    else if (arg === '--db') args.dbName = argv[++i]
    else if (arg === '--email') args.email = argv[++i]
    else if (arg === '--password') args.password = argv[++i]
    else if (arg.startsWith('--db=')) args.dbName = arg.slice(5)
    else if (arg.startsWith('--email=')) args.email = arg.slice(8)
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!args.dbName) throw new Error('--db needs a name')
  return args
}

export function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

async function requireTool(exec, cmd, install) {
  try {
    await exec(cmd, ['--version'])
  } catch {
    throw new Error(`${cmd} is not installed. Install it with:\n    ${install}`)
  }
}

// Re-running setup should replace a variable rather than fail on it, and Vercel
// rejects adding one that already exists.
async function setEnv(exec, key, value, log) {
  try {
    await exec('vercel', ['env', 'rm', key, ENV_TARGET, '--yes'])
  } catch {
    // Not set yet, which is the normal first-run case.
  }
  await exec('vercel', ['env', 'add', key, ENV_TARGET], { input: value })
  log(`  set ${key}`)
}

export async function runSetup({ exec, log, prompt, dbName, email, password, dryRun, deploy }) {
  if (dryRun) {
    log(`Would create Turso database "${dbName}", then set on Vercel (${ENV_TARGET}):`)
    log('  TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, SHELF_OWNER_EMAIL, SHELF_PASSWORD')
    log(deploy ? 'Then deploy with `vercel --prod`.' : 'Deployment skipped (--no-deploy).')
    return { dryRun: true }
  }

  await requireTool(exec, 'turso', 'curl -sSfL https://get.tur.so/install.sh | bash')
  await requireTool(exec, 'vercel', 'npm i -g vercel')

  if (!email) email = await prompt('Email to sign in with: ')
  if (!looksLikeEmail(email)) throw new Error(`"${email}" does not look like an email address`)
  email = email.trim()

  const generated = !password
  if (!password) password = generatePassword()

  // Creating a database that already exists is fine; we want its URL either way.
  log(`\nTurso database "${dbName}"...`)
  try {
    await exec('turso', ['db', 'create', dbName])
    log('  created')
  } catch (e) {
    if (!/exists|already/i.test(e.message)) throw e
    log('  already exists, using it')
  }

  const url = (await exec('turso', ['db', 'show', dbName, '--url'])).trim()
  if (!url.startsWith('libsql://') && !url.startsWith('https://')) {
    throw new Error(`unexpected database URL from turso: ${url}`)
  }
  const token = (await exec('turso', ['db', 'tokens', 'create', dbName])).trim()
  if (!token) throw new Error('turso returned an empty auth token')

  log('\nSetting environment variables on Vercel...')
  await setEnv(exec, 'TURSO_DATABASE_URL', url, log)
  await setEnv(exec, 'TURSO_AUTH_TOKEN', token, log)
  await setEnv(exec, 'SHELF_OWNER_EMAIL', email, log)
  await setEnv(exec, 'SHELF_PASSWORD', password, log)

  if (deploy) {
    log('\nDeploying...')
    await exec('vercel', ['--prod'])
  }

  log(`\nDone. Sign in as ${email}.`)
  if (generated) {
    log(`Your password is:\n\n    ${password}\n\nStore it now -- it is not saved anywhere and cannot be recovered.`)
  }
  if (!deploy) log('Environment set but not deployed; run `vercel --prod` to apply it.')

  return { url, email, deployed: deploy }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer) }))
}

async function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(`${e.message}\nUsage: npm run setup -- [--db NAME] [--email ADDR] [--dry-run] [--no-deploy]`)
    process.exit(1)
  }

  try {
    await runSetup({ exec: realExec, log: m => console.log(m), prompt: ask, ...args })
  } catch (e) {
    console.error(`\nSetup stopped: ${e.message}`)
    process.exit(1)
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) main()
