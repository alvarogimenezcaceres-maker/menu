import { gh } from '../publish/github'

/**
 * Queues a photogrammetry job: commits jobs/3d/<scanId>.json through the GitHub Contents API.
 * The push starts .github/workflows/photogrammetry.yml. The file only holds ids: the repo is public,
 * so the worker asks the panel for the photo URLs with a signed request.
 */
export async function commitJobFile(scanId: number | string): Promise<void> {
  const branch = process.env.GITHUB_BRANCH || 'main'
  const path = `jobs/3d/${scanId}.json`
  let sha: string | undefined
  try {
    sha = (await gh<{ sha: string }>('GET', `/contents/${path}?ref=${branch}`)).sha
  } catch (e) {
    if (!String(e).includes(': 404')) throw e
  }
  const content = JSON.stringify({ scan: Number(scanId), requestedAt: new Date().toISOString() }, null, 2) + '\n'
  await gh('PUT', `/contents/${path}`, {
    message: `3D job: scan ${scanId}`,
    content: Buffer.from(content).toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  })
}
