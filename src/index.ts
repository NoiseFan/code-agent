import type { ContentBlock } from './types'

/**
 * 解析 frontmatter
 */
export function parseFrontmatter(content: string): { meta: Record<string, string> & Partial<{ name: string, description: string }>, body: string } {
  const match = content.match(/^---\n(.*?)\n---\n(.*)/s)
  if (!match)
    return { meta: {}, body: content }

  const meta: Record<string, string> = {}

  for (const line of match[1].trim().split('\n')) {
    if (!line.includes(':'))
      continue

    const colonIndex = line.indexOf(':')
    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()
    meta[key] = value
  }

  return { meta, body: match[2] }
}
