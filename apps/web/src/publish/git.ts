import { execFile } from 'child_process'
import { mkdir, readdir, rm, writeFile } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'

import { OWNED_DIRS, REPO_ROOT } from './export'
import type { PublishResult } from './github'

const run = promisify(execFile)
const git = async (...args: string[]) =>
  (await run('git', args, { cwd: REPO_ROOT, timeout: 120_000, windowsHide: true })).stdout.trim()

/**
 * Local publisher (notebook): writes the files into the repo, commits and pushes.
 * GitHub Actions then rebuilds the menus and deploys them to Cloudflare.
 */
export async function commitAndPush(relDir: string, files: Map<string, Buffer>, message: string): Promise<PublishResult> {
  const outDir = path.join(REPO_ROOT, relDir)
  // drop files the menu no longer uses so the repo stays small
  for (const dir of OWNED_DIRS) {
    await mkdir(path.join(outDir, dir), { recursive: true })
    for (const f of await readdir(path.join(outDir, dir))) {
      if (!files.has(`${dir}/${f}`)) await rm(path.join(outDir, dir, f))
    }
  }
  for (const [rel, bytes] of files) await writeFile(path.join(outDir, rel), bytes)

  await git('add', '--all', '--', relDir)
  const staged = await git('diff', '--cached', '--name-only', '--', relDir)
  if (!staged) return { changed: false }
  await git('commit', '-m', message, '--', relDir)
  const commit = await git('rev-parse', '--short', 'HEAD')
  await git('push', 'origin', 'HEAD')
  return { changed: true, commit, files: staged.split('\n').length }
}
