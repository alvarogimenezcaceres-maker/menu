import { execFile } from 'child_process'
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
