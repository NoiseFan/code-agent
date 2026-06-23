import type { CompactState, Message, ToolDefinition, ToolResultBlock, ToolUseBlock } from '../types'

import fs from 'node:fs/promises'
import path from 'node:path'
import pc from 'picocolors'
import { client, MODEL, WORKDIR } from '../core/runtime'

import { runBash, runEdit, runRead, runWrite } from '../core/tools'
import { writeJSONFile } from '../utils/write'

/* ==================== 配置常量 ==================== */
// 上下文上限（估算）
export const CONTEXT_LIMIT = 5_000

// 保留最近几个完整工具调用结果
const KEEP_RECENT_TOOL_RESULTS = 3

// 输出超出阈值，写入磁盘
const PERSIST_THRESHOLD = 30_000

// 预览字数
const PREVIEW_CHARS = 2000

// transcript 目录
const TRANSCRIPT_DIR = path.join(path.join(WORKDIR, '.tmp'), '.transcripts')

// tool_result 目录
const TOOL_RESULTS_DIR = path.join(WORKDIR, '.task_outputs', 'tool-results')

/* ==================== 工具函数 ==================== */
/**
 * 估算上下文大小
 */
export function estimateContextSize(message: Message[]): number {
  return JSON.stringify(message).length
}

/**
 * 记录最近访问的文件
 */
function trackRecentFile(state: CompactState, filePath: string): void {
// 已存在则删除（保持最新在后）
  const index = state.recentFiles.indexOf(filePath)
  if (index !== -1)
    state.recentFiles.splice(index, 1)

  state.recentFiles.push(filePath)

  // 仅保留最近 5个
  if (state.recentFiles.length > 5)
    state.recentFiles = state.recentFiles.slice(-5)
}

/* ==================== 第 1 层：大结果持久化 ==================== */
export async function persistLargeOutput(toolUsedId: string, output: string): Promise<string> {
  if (output.length <= PERSIST_THRESHOLD)
    return output

  await fs.mkdir(TOOL_RESULTS_DIR, { recursive: true })

  // 落盘
  const storePath = path.join(TOOL_RESULTS_DIR, `${toolUsedId}.txt`)
  await fs.writeFile(storePath, output, 'utf-8')

  // 生成预览标记
  const preview = output.slice(0, PREVIEW_CHARS)
  const relPath = path.relative(WORKDIR, storePath)

  return `<persisted-output>
Full output saved to: ${relPath}
Preview::
${preview}
</persisted-output>`
}

/* ==================== 第 2 层：微压缩 ==================== */

type blockType = Array<{ messageIndex: number, blockIndex: number, block: ToolResultBlock }>

/**
 * 收集 messages 中的 tool_result blocks
 */
function collectToolResultBlocks(messages: Array<Message>): blockType {
  const blocks: blockType = []

  for (const [messageIndex, message] of messages.entries()) {
    if (message.role !== 'user' || !Array.isArray(message.content))
      continue

    for (const [blockIndex, block] of message.content.entries()) {
      if (block.type === 'tool_result')
        blocks.push({ messageIndex, blockIndex, block: block as ToolResultBlock })
    }
  }
  return blocks
}
/**
 * 微压缩
 * 只保留最近 3 个完整结果，更旧的改占位
 *
 * 实际上就保留了 tool_use_id
 */
export function microCompact(messages: Array<Message>): Array<Message> {
  const toolsResult = collectToolResultBlocks(messages)

  if (toolsResult.length <= KEEP_RECENT_TOOL_RESULTS)
    return messages

  // 仅压缩旧的记录（非最近 3 条）
  const oldResults = toolsResult.slice(0, -KEEP_RECENT_TOOL_RESULTS)
  for (const { block } of oldResults) {
    const content = block.content
    if (content.length <= 120)
      continue

    // 替换占位提示
    block.content = '[Earlier tool result compacted. Re-run the tool if you need full detail.]'
  }
  return messages
}

export async function executeToolWithCompact(opts: {
  toolBlock: ToolUseBlock
  state: CompactState
}): Promise<string> {
  const { state } = opts
  const { name, input, id } = opts.toolBlock
  if (name === 'bash') {
    const command = input.command as string
    const output = await runBash({ command })
    return persistLargeOutput(id, output)
  }

  if (name === 'read_file') {
    const filePath = input.path as string
    trackRecentFile(state, filePath)

    const cotent = await runRead({
      path: filePath,
      limit: input.limit as string | undefined,
    })
    return persistLargeOutput(id, cotent)
  }

  if (name === 'write_file') {
    return runWrite({
      path: input.path as string,
      content: input.content as string,
    })
  }

  if (name === 'edit_file') {
    return runEdit({
      path: input.path as string,
      old_text: input.old_text as string,
      new_text: input.new_text as string,
    })
  }

  if (name === 'compact')
    return 'Compacting conversation...'

  return `Unknow tool: ${name}`
}

/* ==================== 第 3 层：完整压缩 ==================== */

/**
 * 完整备份历史
 */
async function writeTranScript(messages: Array<Message>) {
  await fs.mkdir(TRANSCRIPT_DIR, { recursive: true })

  const transcriptPath = path.join(TRANSCRIPT_DIR, `transcript${+Date.now()}.jsonl`)
  const lines = messages.map(m => JSON.stringify(m))
  await fs.writeFile(transcriptPath, lines.join('\n'), 'utf-8')

  return transcriptPath
}

async function summarizeHistory(messages: Message[]): Promise<string> {
  const conversation = JSON.stringify(messages).slice(0, 80_000)

  const prompt = `Summarize this coding-agent conversation so work can continue.
Preserve:
1. The current goal
2. Important findings and decisions
3. Files read or changed
4. Remaining work
5. User constraints and preferences
Be compact but concrete.

${conversation}`

  const response = await client.messages.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2_000,
  })

  // 提取文本
  const textBlocks = response.content.filter(b => b.type === 'text')

  await writeJSONFile({
    path: `./.tmp/compact/${+Date.now()}.json`,
    content: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: textBlocks },
    ],
  })

  return textBlocks.map(b => b.text).join('\n').trim()
}

interface CompactHistoryOptsType {
  message: Array<Message>
  state: CompactState
  compactFocus?: string
}
export async function compactHistory(opts: CompactHistoryOptsType): Promise<Array<Message>> {
  const { message, state, compactFocus } = opts

  // 1. 先写 transcript (完整历史备份)
  const trancscriptPath = await writeTranScript(message)
  console.log(pc.green(`[transcript saved: ${path.relative(WORKDIR, trancscriptPath)}]`))

  // 2. 调用 LLM 生成摘要
  let summary = await summarizeHistory(message)

  // 3. 添加 focus 信息（手动压缩时）
  if (compactFocus)
    summary += `\n\n Focus to preserve next ${compactFocus}`

  // 4. 添加 recent files 信息
  if (state.recentFiles.length > 0) {
    const recentLines = state.recentFiles.map(f => `-${f}`).join('\n')
    summary += `\n\nRecent files to repen if needed:\n${recentLines}`
  }

  // 5. 更新状态
  state.hasCompacted = true
  state.lastSummary = summary

  // 6. 返回新的简洁上下文
  return [
    {
      role: 'user',
      content: `This conversation was compacted so the agent can continue working.\n\n${summary}`,
    },
  ]
}

/* ==================== compact 工具定义 ==================== */
export const COMPACT_TOOL_DEFINITION: ToolDefinition = {
  name: 'compact',
  description: 'Summarize earlier conversation so work can continue in a smaller context. Use when the conversation gets too long.',
  input_schema: {
    type: 'object',
    properties: {
      focus: {
        type: 'string',
        description: 'Specific focus to preserve in summary',
      },
    },
  },
}

/**
 * 创建初始压缩状态
 */
export function createCompactState(): CompactState {
  return {
    hasCompacted: false,
    lastSummary: '',
    recentFiles: [],
  }
}
