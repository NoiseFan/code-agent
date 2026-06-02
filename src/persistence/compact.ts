import type { CompactState, Message, ToolDefinition, ToolResultBlock, ToolUseBlock } from '../types'

import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKDIR } from '../core/agent-loop'
import { runBash, runEdit, runRead, runWrite } from '../core/tools'

/* ==================== 配置常量 ==================== */
// 上下文上限（估算）
export const CONTEXT_LIMIT = 5_000

// 保留最近几个完整工具调用结果
const KEEP_RECENT_TOOL_RESULTS = 3

// 输出超出阈值，写入磁盘
const PERSIST_THRESHOLD = 30_000

// 预览字数
const PREVIEW_CHARS = 2000

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
        block.push({ messageIndex, blockIndex, block: block as ToolResultBlock })
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

interface CompactHistoryOptsType {
  message: Array<Message>
  state: CompactState
  compactFocus?: string
}
export async function compactHistroy(opts: CompactHistoryOptsType): Promise<Array<Message>> {
  const { message, state, compactFocus } = opts
  // 1. 先写 transcript (完整历史备份)
  // const trancscriptPath = await writeTranScript(message)
  return message
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
