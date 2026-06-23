import type { ToolDefinition } from '../types'
import type { PromptBuilderOptions } from '../types/prompt'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import process from 'node:process'
import pc from 'picocolors'
import { parseFrontmatter } from '..'
import { WORKDIR } from '../core/runtime'

/**
 *
 * 核心思想：
 * 系统提示词不应该是一个大字符串，而是由 6 个独立 section 按顺序组装的管道
 * Section 1: Core Instructions     - 核心规则
 * Section 2: Tool Listing          - 工具列表（从 BASE_TOOLS 自动生成）
 * Section 3: Skill Metadata        - 技能元数据（扫描 skills/ 目录）
 * Section 4: Memory Content        - 记忆内容（直接复用 s09 MemoryManager）
 * Section 5: CLAUDE.md chain       - 用户自定义指令（三层加载）
 * Section 6: Dynamic Context       - 动态上下文（运行时信息）
 */

/**
 * 默认 system prompt
 */
function defaultSystemPrompt(workdir: string): string {
  const prompt: Array<string> = [
    `You are a coding agent operating in ${workdir}.`,
    'Use the provided tools to explore, read, write and edit files.',
    'Always verify before assuming. Prefer reading files over guessing.',
  ]
  return prompt.join('\n')
}

const DYNAMIC_BOUNDARY = '=== DYNAMIC_BOUNDARY ==='

export class SystemPromptBuilder {
  private workdir: string
  private baseSystem: string
  private tools: Array<ToolDefinition>
  private stableCache: string | null = null
  private memoryManager: PromptBuilderOptions['memoryManager']
  private skillsDir: string

  constructor(opts: PromptBuilderOptions) {
    const { workdir, baseSystem, tools, memoryManager } = opts

    this.workdir = workdir || WORKDIR
    this.baseSystem = baseSystem || defaultSystemPrompt(this.workdir)
    this.tools = tools || []
    this.skillsDir = join(this.workdir, 'skills')
    this.memoryManager = memoryManager
  }

  /**
   * Section1: 核心指令
   */
  private _buildCore(): string {
    return this.baseSystem
  }

  /**
   * Section2: 工具列表
   */
  private _buildToollListing(): string {
    if (!this.tools.length)
      return ''
    const lines = ['# Available tools']

    // 这里面也是借鉴了 “渐进式暴露的规则”，先把 name 和 description 暴漏出去，动态加载 input_schema
    for (const tool of this.tools) {
      const props = tool.input_schema?.properties || {}
      const params = Object.keys(props).join(', ')
      lines.push(`- ${tool.name}(${params}): ${tool.description}`)
    }
    return lines.join('\n')
  }

  /**
   * Section3: Skill 元数据
   */
  private _buildSkillListing() {
    if (!existsSync(this.skillsDir))
      return ''

    const skills: Array<string> = []
    const dirs = readdirSync(this.skillsDir)

    for (const dir of dirs) {
      const entryFile = join(this.skillsDir, dir, 'SKILL.md')
      if (!existsSync(entryFile))
        continue

      const content = readFileSync(entryFile, 'utf-8')
      const { meta } = parseFrontmatter(content)
      const name = meta.name || dir
      const desc = meta.description || ''

      skills.push(`- ${name}: ${desc}`)
    }
    if (!skills.length)
      return ''

    return ['<available-skills>', ...skills, '</available-skills>'].join('\n')
  }

  /**
   * Section4: 记忆内容
   */
  private _buildMemorySection() {
    if (!this.memoryManager)
      return ''
    return this.memoryManager.loadMemoryPrompt()
  }

  /**
   * Section5: CLAUDE.md
   */
  private _buildClaudeMD(): string {
    const sources: [string, string][] = []
    // 1. 用户全局 ~/.claude/CLAUDE.md
    const userEntry = join(homedir(), '.claude', 'CLAUDE.md')
    if (existsSync(userEntry))
      sources.push(['user global (~/.claude/CLAUDE.md)', readFileSync(userEntry, 'utf-8')])

    // 2. 项目级
    const projectEntry = join(this.workdir, 'CLAUDE.md')
    if (existsSync(projectEntry))
      sources.push(['project root (CLAUDE.md)', readFileSync(projectEntry, 'utf-8')])

    // 3. 项目子目录
    const cwd = process.cwd()
    if (cwd !== this.workdir) {
      const subDirEntry = join(cwd, 'CLAUDE.md')
      if (existsSync(subDirEntry))
        sources.push([`subdir (${basename(cwd)}/CLAUDE.md)`, readFileSync(subDirEntry, 'utf-8')])
    }

    if (!sources.length)
      return ''
    const parts = ['# CLAUDE.md instructions']
    for (const [label, content] of sources) {
      parts.push(`## From ${label}`)
      parts.push(content.trim())
    }

    return ['<CLAUDE>', ...parts, '</CALUDE>'].join('\n')
  }

  /**
   * Section6: 构建动态部分
   * 每轮对话都可能变化，不缓存
   */
  private buildDynamicContext(): string {
    const lines: Array<string> = [
      '<dynamic-context>',
      `- Current date: ${new Date().toISOString().split('T')[0]}`,
      `- Wokding directory: ${this.workdir}`,
      `- Platform: ${process.platform}`,
      '</dynamic-context>',
    ]
    return lines.join('\n')
  }

  /**
   * 清除稳定部分缓存
   * 当记忆、CLAUDE.md、工具列表等变化时调用
   */
  invalidateCache(): void {
    this.stableCache = null
  }

  /**
   * 构建稳定部分 Section 1-5
   */
  buildStable(): string {
    if (this.stableCache)
      return this.stableCache

    const sections: Array<string> = []
    for (const builder of [
      this._buildCore,
      this._buildToollListing,
      this._buildSkillListing,
      this._buildMemorySection,
      this._buildClaudeMD,
    ]) {
      const section = builder()
      if (section)
        sections.push(section)
    }
    this.stableCache = sections.join('\n\n')
    return this.stableCache
  }

  /**
   * 组装完整的系统提示词
   */
  build(): string {
    return [this.buildStable(), DYNAMIC_BOUNDARY, this.buildDynamicContext()].join('\n\n')
  }

  /**
   * 输出提示词统计
   */
  notify(): void {
    const fullPrompt = this.build()
    const tokenEsimate = esimateTokens(fullPrompt)
    console.log(`[System prompt assembled: ${fullPrompt.length} chars, ~${tokenEsimate} tokens]`)
  }
}

/**
 * 提取签名
 * 1. 去除所有换行符
 * 2. 去除空格
 * 3. 提取 20 < prompt < 200 的子段
 * 4. 取前 20 位
 */
function extractSignatures(prompt: string): Array<string> {
  return prompt.split(/[.\n]/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 200).slice(0, 20)
}

interface detectPromptLeakageReturnType {
  /**
   * 是否泄露
   */
  leaked: boolean
  /**
   * 相似度
   */
  similarity: number
  /**
   * 符合的判断
   */
  matched: string[]
}

/**
 * 检查 LLM 输出是否泄露了系统提示词
 * 通过对比签名计算相似度方法处理
 */
export function detectPromptLeakage(output: string, systemPrompt: string, threshold: number = 0.3): detectPromptLeakageReturnType {
  const signatures = extractSignatures(systemPrompt)
  console.log(pc.blue(`[Signature calculation result]: ${signatures}`))
  const matched: Array<string> = []

  for (const sig of signatures) {
    if (output.includes(sig))
      matched.push(sig)
  }

  const similarity = matched.length / Math.max(signatures.length, 1)
  return {
    leaked: similarity > threshold,
    similarity: Math.round(similarity * 100) / 100,
    matched,
  }
}

/**
 * 粗略估算 token 数（不引入 tokenizer 库）
 * - 英文：约 4 个字符 = 1 token
 * - 中文：约 1.5 个字符 = 1 token
 */
function esimateTokens(prompt: string): number {
  const englishChars = (prompt.match(/[a-z0-9\s]/gi) || []).length
  const otherChars = prompt.length - englishChars
  return Math.ceil(englishChars / 4 + otherChars * 1.5)
}
