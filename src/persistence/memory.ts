import type { MemoryEntry, MemoryType, ParsedMemory } from '../types/memory'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORKDIR } from '../core/runtime'

// 记忆存储目录
const MEMORY_DIR = join(WORKDIR, '.memory')

// 支持的记忆类型
export const MEMORY_TYPE: Array<MemoryType> = ['user', 'feedback', 'project', 'reference']

// 记忆指南（注入系统提示词）
export const MEMORY_GUIDANCE = `When to save memories:
- User states a preference ("I like tabs", "always use pytest") -> type user
- User corrects you ("don't do X", "that was wrong because...") -> type feeback
- You learn a project fact the is not easy to infer from current code alone
  (for example: a rule exists because of comliance, or a leagcy module must
   stay untouched for business reasons) -> type: project
- You learn where an external resource lives (ticket borad, dashborad, docs URL) -> type: reference

When NOT to save:
- Anything easing derivable from code (functionn signatures, file structure, directory layout)
- Temporay task state (current branch, open PR number, current TODOS)
- Secrets or credentials (API keys, passwords)
`

export class MemoryManger {
  private memoryDir: string
  // 内存中的记忆
  memories: Map<string, MemoryEntry>

  constructor(memoryDir?: string) {
    this.memoryDir = memoryDir || MEMORY_DIR
    this.memories = new Map()
  }

  loadAll(): void {
    this.memories = new Map()
    if (!existsSync(this.memoryDir))
      return

    // 扫描所有 .md 文件
    const files = readdirSync(this.memoryDir)

    for (const file of files) {
      if (!file.endsWith('.md'))
        continue
      if (file === 'MEMORY.md')
        continue

      // 读取文件
      const filePath = join(this.memoryDir, file)
      const content = readFileSync(file, 'utf-8')
      const parsed = this.parseFrontmatter(content)

      if (parsed && parsed.name) {
        this.memories.set(parsed.name, {
          name: parsed.name,
          description: parsed.description || '',
          type: (parsed.type as MemoryType) || 'project',
          content: parsed.content,
          file,
        })
      }
    }
  }

  loadMemoryPrompt(): string {
    return ''
  }

  saveMemory(opts: {
    name: string
    description: string
    type: MemoryType
    content: string
  }): string {
    return ''
  }

  private rebuildIndex(): void {}

  private parseFrontmatter(content: string): ParsedMemory | null {
    const match = content.match(/^---\n(.*?)\n---\n(.*)/s)
    if (!match)
      return null

    const header = match[1]
    const body = match[2]

    const result: ParsedMemory = {
      content: body.trim(),
    }

    for (const line of header.split('\n')) {
      const colIndex = line.indexOf(':')
      if (colIndex) {
        const key = line.slice(0, colIndex).trim() as keyof ParsedMemory
        const value = line.slice(colIndex + 1).trim()

        if (key === 'name')
          result.name = value
        if (key === 'description')
          result.description = value
        if (key === 'type')
          result.type = value as MemoryType
      }
    }
    return result
  }
}
