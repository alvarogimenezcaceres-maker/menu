import { createHash } from 'crypto'

import { OWNED_DIRS } from './export'

export type PublishResult = { changed: false } | { changed: true; commit: string; files: number }

type TreeEntry = { path: string; mode: string; type: string; sha: string | null }

/** Same hash git uses for a file, so unchanged photos and models are not uploaded again. */
const blobSha = (bytes: Buffer) =>
  createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')

async function gh<T>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}${route}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`GitHub ${method} ${route}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

/**
 * Cloud publisher (no git on the server): commits the restaurant folder through the GitHub API.
 * GitHub Actions then rebuilds the menus and deploys them to Cloudflare.
 */
export async function commitViaGitHub(relDir: string, files: Map<string, Buffer>, message: string): Promise<PublishResult> {
  const branch = process.env.GITHUB_BRANCH || 'main'
  const head = (await gh<{ object: { sha: string } }>('GET', `/git/ref/heads/${branch}`)).object.sha
  const baseTree = (await gh<{ tree: { sha: string } }>('GET', `/git/commits/${head}`)).tree.sha
  const current = await gh<{ tree: TreeEntry[]; truncated: boolean }>('GET', `/git/trees/${baseTree}?recursive=1`)
  if (current.truncated) throw new Error('El repositorio es demasiado grande para publicar por la API')

  const prefix = `${relDir}/`
  const existing = new Map(current.tree.filter((e) => e.type === 'blob' && e.path.startsWith(prefix)).map((e) => [e.path, e.sha]))

  const changes: TreeEntry[] = []
  for (const [rel, bytes] of files) {
    const p = prefix + rel
    if (existing.get(p) === blobSha(bytes)) continue
    const { sha } = await gh<{ sha: string }>('POST', '/git/blobs', { content: bytes.toString('base64'), encoding: 'base64' })
    changes.push({ path: p, mode: '100644', type: 'blob', sha })
  }
  // remove photos and models the menu no longer uses
  for (const p of existing.keys()) {
    const rel = p.slice(prefix.length)
    if (OWNED_DIRS.some((d) => rel.startsWith(`${d}/`)) && !files.has(rel)) {
      changes.push({ path: p, mode: '100644', type: 'blob', sha: null })
    }
  }
  if (!changes.length) return { changed: false }

  const tree = await gh<{ sha: string }>('POST', '/git/trees', { base_tree: baseTree, tree: changes })
  const commit = await gh<{ sha: string }>('POST', '/git/commits', { message, tree: tree.sha, parents: [head] })
  await gh('PATCH', `/git/refs/heads/${branch}`, { sha: commit.sha })
  return { changed: true, commit: commit.sha.slice(0, 7), files: changes.length }
}
