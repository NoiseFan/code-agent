import type { MemoryEntry, MemoryMeta, MemoryType, ParsedMemory } from '../types/memory'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pc from 'picocolors'
import { WORKDIR } from '../core/runtime'

// 记忆存储目录
const MEMORY_DIR = join(WORKDIR, '.memory')

// 索引文件
const MEMORY_INDEX = join(MEMORY_DIR, 'MEMORY.md')

// 支持的记忆类型
export const MEMORY_TYPE: Array<MemoryType> = ['user', 'feedback', 'project', 'reference']

// 最大索引行数
const MAX_INDEX_LINES = 200

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

  /**
   * 初始化 Memory
   */
  init(): void {
    this.loadAll()
    this.notify()
  }

  /**
   * 加载所有记忆
   * 1. 先扫描 .memory 目录下所有 .md 文件
   * 2. 在解析 frontmatter
   */
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
      const content = readFileSync(filePath, 'utf-8')
      const parsed = this.parseFrontmatter(content)

      if (parsed && parsed.name && parsed.content) {
        this.memories.set(parsed.name, {
          name: parsed.name,
          description: parsed.description || '',
          type: (parsed.type as MemoryType) || 'project',
          content: parsed.content,
          file,
        })
      }
    }

    if (this.memories.size > 0)
      console.log(pc.blue(`Memory loaded: ${this.memories.size} memories from ${this.memoryDir}`))
  }

  /**
   * 构建记忆内容，将记忆注入到 SystemPrompt 中
   * 按类型分租，生成 Markdown 格式
   */
  loadMemoryPrompt(): string {
    if (!this.memories.size)
      return ''

    const sections: Array<string> = [
      '# Memories (persistent across sessions)',
      '',
    ]

    for (const type of MEMORY_TYPE) {
      const typed = [...this.memories.values()].filter(m => m.type === type)
      if (!type.length)
        continue

      sections.push(`## [${type}]`)
      for (const mem of typed) {
        sections.push(`### ${mem.name}: ${mem.description}`)

        if (mem.content.trim())
          sections.push(mem.content.trim())
        sections.push('')
      }
    }
    return sections.join('\n')
  }

  /**
   * 保存记忆
   * 1. 将记忆写入文件
   * 2. 更新内存中记忆
   * 3. 重建记忆索引
   */
  saveMemory(opts: MemoryMeta): string {
    const { name, description, type, content } = opts
    if (!MEMORY_TYPE.includes(type))
      return `Error: type must be one of [${MEMORY_TYPE.join(', ')}]`
    // 生成安全文件名称
    const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/, '_')
    if (!safeName)
      return 'Error: invalid memory name'

    const fileName = `${safeName}.md`
    const filePath = join(this.memoryDir, fileName)

    // 确保目录已创建
    mkdirSync(this.memoryDir, { recursive: true })

    // 构建 frontmatter
    const frontmatter = [
      '---',
      `name: ${name}`,
      `description: ${description}`,
      `type: ${type}`,
      '---',
      content,
      '',
    ].join('\n')
    console.log('[saved]')

    writeFileSync(filePath, frontmatter, 'utf-8')

    // 更新内存
    this.memories.set(name, { name, description, type, content, file: fileName })

    // 重建索引
    this.rebuildIndex()

    return `Saved memory '${name}' [${type}] to .memory/${fileName}`
  }

  /**
   * 重建 MEMORY.md 索引
   */
  private rebuildIndex(): void {
    const lines: Array<string> = ['#Memory Index', '']

    for (const [name, mem] of this.memories) {
      lines.push(`- [${name}](${mem.file}) - ${mem.description} [${mem.type}]`)

      // 限制行数
      if (lines.length > MAX_INDEX_LINES) {
        lines.push(`... (truncated at ${MAX_INDEX_LINES} lines)`)
        break
      }
    }

    // 确保目录已创建
    mkdirSync(this.memoryDir, { recursive: true })

    // 写入索引文件
    writeFileSync(MEMORY_INDEX, `${lines.join('\n')}\n`, 'utf-8')
  }

  /**
   * 解析 frontmatter
   * 提取 `---` 分隔的头部和正文
   */
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

  /**
   * 初始化提示
   */
  notify(): void {
    if (this.memories.size) {
      console.log(`[${this.memories.size} memories loaded into context]`)
    }
    else {
      console.log('[No existing memories. The agent can create them with save_mamory.]')
    }
  }
}
