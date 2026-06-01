import type { SkillDocument, ToolDefinition, ToolHandler } from '../types'
import fs from 'node:fs/promises'
import path from 'node:path'
import pc from 'picocolors'
import { WORKDIR } from '../core/agent-loop'

const SKILLS_DIR = path.join(WORKDIR, 'skills')
export class SKILLRegistry {
  private documents: Record<string, SkillDocument> = {}
  readonly ready: Promise<void>
  constructor(skillsDir: string = SKILLS_DIR) {
    this.ready = this.loadAll(skillsDir)
  }

  async loadAll(skillDir: string): Promise<void> {
    try {
      const entries = await fs.readdir(skillDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory())
          continue

        const skillPath = path.join(skillDir, entry.name, 'SKILL.md')
        try {
          const content = await fs.readFile(skillPath, 'utf-8')
          const { meta, body } = this.parseFrontmatter(content)

          const name = meta.name || entry.name
          const description = meta.description as string || 'No description'

          this.documents[name] = {
            manifast: { name, description, path: skillPath },
            body: body.trim(),
          }
        }
        catch { continue }
      }
    }
    catch {}
  }

  /**
   * 解析 frontmatter
   */
  parseFrontmatter(content: string): { meta: Record<string, unknown> & Partial<{ name: string }>, body: string } {
    const match = content.match(/^---\n(.*?)\n---\n(.*)/s)
    if (!match)
      return { meta: {}, body: content }

    const meta: Record<string, unknown> = {}

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

  /**
   * 生成轻量的目录
   */
  describeAvailable(): string {
    if (Object.keys(this.documents).length === 0)
      return '(no skills available)'

    const lines: string[] = []
    for (const name of Object.keys(this.documents).sort()) {
      const doc = this.documents[name]
      lines.push(`- ${doc.manifast.name}:  ${doc.manifast.description}`)
    }
    return lines.join('\n')
  }

  /**
   * 加载完整正文
   */
  loadFullText(name: string): string {
    const doc = this.documents[name]
    if (!doc) {
      const known = Object.keys(this.documents).sort().join(', ') || '(none)'
      return `Error: Unknow skille '${name}'. Available skills ${known}`
    }

    return `<skill name="${doc.manifast.name}">\n${doc.body}\n</skill>`
  }
}

export const LOAD_SKILL_TOOL_DEFINITION: ToolDefinition = {
  name: 'load_skill',
  description: 'Load the full body of a name skill into the the current context. Use this when you need specialized instructions for a task type.',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The skill name to load',
      },
    },
    required: ['name'],
  },
}

export function createLoadSkillHandler(registry: SKILLRegistry): ToolHandler {
  return (input): string => {
    const name = input.name as unknown as string
    if (!name)
      return 'Error: skill name is required.'

    console.log(pc.yellow(`load skill ${name}`))
    const content = registry.loadFullText(name)
    console.log(pc.yellow(`${content.slice(0, 100)}...`))
    return content
  }
}
