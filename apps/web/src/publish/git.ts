import { execFile, spawn } from 'child_process'
import { openSync } from 'fs'
import path from 'path'
import { promisify } from 'util'

import { REPO_ROOT } from './export'

const run = promisify(execFile)
const git = async (...args: string[]) =>
  (await run('git', args, { cwd: REPO_ROOT, timeout: 120_000, windowsHide: true })).stdout.trim()

/** Commits the restaurant folder and pushes; GitHub Actions then rebuilds GitHub Pages. */
export async function commitAndPush(relDir: string, message: string) {
  await git('add', '--all', '--', relDir)
  const staged = await git('diff', '--cached', '--name-only', '--', relDir)
  if (!staged) return { changed: false as const }
  await git('commit', '-m', message, '--', relDir)
  const commit = await git('rev-parse', '--short', 'HEAD')
  await git('push', 'origin', 'HEAD')
  return { changed: true as const, commit, files: staged.split('\n').length }
}

/**
 * Rebuilds the static menus and deploys them to Cloudflare in the background (takes ~1 minute),
 * so the admin gets an answer right away. Output goes to .local/deploy-cloudflare.log.
 */
export function deployToCloudflare() {
  const log = openSync(path.join(REPO_ROOT, '.local', 'deploy-cloudflare.log'), 'a')
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'site', 'deploy-cloudflare.mjs')], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  })
  child.unref()
}
