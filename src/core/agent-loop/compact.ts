import type { AgentLoopWithCompactOptions, ContentBlock, Message, ToolInput, ToolUseBlock } from '../../types'
import pc from 'picocolors'
import {
  compactHistory,
  CONTEXT_LIMIT,
  estimateContextSize,
  executeToolWithCompact,
  microCompact,
} from '../../persistence/compact'
import { convertTools } from '../index'
import { client, MODEL } from '../runtime'
import { BASE_TOOLS } from '../tools'

/**
 * 主循环（带压缩）
 */
export async function agentLoopWithCompact(messages: Array<Message>, opts: AgentLoopWithCompactOptions): Promise<void> {
  const { system, tools = BASE_TOOLS, state } = opts
  const anthropicTools = convertTools(tools)

  while (true) {
    const replaceHistory = (nextMessages: Array<Message>) => {
      messages.splice(0, messages.length, ...nextMessages)
    }

    // 每轮开始之前做微压缩
    microCompact(messages)

    // 检查是否需要完整压缩
    if (estimateContextSize(messages) > CONTEXT_LIMIT) {
      console.log('[auto compact]')
      replaceHistory(await compactHistory({ message: messages, state }))
    }

    const response = await client.messages.create({
      model: MODEL,
      system,
      messages,
      tools: anthropicTools,
      max_tokens: 8000,
    })

    messages.push({ role: 'assistant', content: response.content as ContentBlock[] })

    if (response.stop_reason !== 'tool_use')
      return

    // 执行工具
    const results: Array<ContentBlock> = []
    let manualCompact = false
    let compactFocus: string | undefined

    for (const block of response.content) {
      if (block.type !== 'tool_use')
        continue

      const toolBlock = block as ToolUseBlock
      const output = await executeToolWithCompact({ toolBlock, state })

      if (toolBlock.name === 'compact') {
        manualCompact = true
        const input = toolBlock.input as ToolInput | undefined
        compactFocus = (input?.focus as string) || undefined
      }

      console.log(`> ${toolBlock.name}: ${output.slice(0, 200)}`)
      results.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: output,
      })
    }

    messages.push({ role: 'user', content: results })

    if (manualCompact) {
      console.log(pc.cyan('[manual compact]'))
      replaceHistory(await compactHistory({ message: messages, state, compactFocus }))
    }
  }
}
