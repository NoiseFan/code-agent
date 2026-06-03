import type Anthropic from '@anthropic-ai/sdk'
import type { AgentLoopOptions, AgentLoopWithCompactOptions, ContentBlock, Message, ToolHandler, ToolResultBlock, ToolUseBlock } from '../types'
import pc from 'picocolors'
import { converTools } from '.'
import { compactHistory, CONTEXT_LIMIT, estimateContextSize, executeToolWithCompact, microCompact } from '../persistence/compact'
import { client, MODEL, WORKDIR } from './runtime'

export { client, MODEL, WORKDIR } from './runtime'

export async function agentLoop(messages: Message[], options: AgentLoopOptions): Promise<void> {
  const { handlers, todoManager, tools } = options
  const system = options.system ?? `You are a coding agent at ${WORKDIR}, use tools to solve tasks. Act, don't explain.`
  const anthropicTools = converTools(tools)
  while (true) {
    // 1. 调用 LLM
    const response = await client.messages.create({
      model: MODEL,
      system,
      messages,
      tools: anthropicTools,
      max_tokens: 8000,
    })

    // 2. 记录 assistant 回复
    messages.push({
      role: 'assistant',
      content: response.content as ContentBlock[],
    })

    // 3. 如果模型决定停止，退出循环
    if (response.stop_reason !== 'tool_use')
      return

    let useTodo = false
    const results = await execTool(response, {
      handlers,
      finalCallBack: (toolBlock) => {
        // s03: 记录是否使用了 todo
        if (toolBlock.name === 'todo') {
          useTodo = true
        }
      },
    })

    // todo 提醒机制
    if (todoManager) {
      if (!useTodo) {
        todoManager.noteRoundWithoutUpdate()
        const reminder = todoManager.reminder()
        if (reminder) {
          // 提醒插入到 results 开头
          results.unshift({ type: 'text', text: reminder })
          console.log(pc.magenta(reminder))
        }
      }
    }

    // 5. 将结果追加回消息
    messages.push({ role: 'user', content: results })

    // 循环继续，回到步骤 1...
  }
}

export function extractTextReply(message: Message[]): string {
  const lastContent = message.at(-1)?.content
  if (Array.isArray(lastContent)) {
    for (const block of lastContent) {
      if (block.type === 'text')
        return block.text
    }
  }
  return ''
}

export async function execTool(
  response: Anthropic.Message,
  context: {
    handlers: Record<string, ToolHandler>
    finalCallBack?: (toolBlock: ContentBlock) => void
  },
): Promise<Array<ContentBlock>> {
  const results: ToolResultBlock[] = []
  for (const block of response.content) {
    if (block.type !== 'tool_use')
      continue

    const { handlers, finalCallBack } = context
    const toolBlock = block

    const handler = handlers[toolBlock.name]
    if (!handler) {
      console.log(pc.red(`Unknow tools:${toolBlock.name}`))
      results.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: `Error: Unknown tool "${toolBlock.name}"`,
      })
      continue
    }
    // 打印工具调用
    console.log(pc.yellow(toolBlock.name))

    // 执行工具
    const output = await handler(toolBlock.input as Record<string, unknown>)
    console.log(output.slice(0, 200))

    results.push({
      type: 'tool_result',
      tool_use_id: toolBlock.id,
      content: output.slice(0, 50_000), // 限制输出长度
    })

    // 执行结束回调
    finalCallBack?.(toolBlock)
  }
  return results
}

/* ==================== 主循环（带压缩） ==================== */

export async function agentLoopWithCompact(messages: Array<Message>, opts: AgentLoopWithCompactOptions): Promise<void> {
  const { system, tools, state } = opts
  const anthropicTools = converTools(tools)

  while (true) {
    // 每轮开始之前做微压缩
    let message = microCompact(messages)

    // 检查是否需要完整压缩
    if (estimateContextSize(message) > CONTEXT_LIMIT) {
      console.log('[auto compact]')
      message = await compactHistory({ message, state })
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
        const input = toolBlock.input as Record<string, unknown> | undefined
        compactFocus = (input?.focus as string) || undefined
      }

      console.log(`> ${toolBlock.name}: ${output.slice(0, 200)}`)
      results.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: output,
      })
    }

    message.push({ role: 'user', content: results })

    if (manualCompact) {
      console.log(pc.cyan('[manual compact]'))
      message = await compactHistory({ message, state, compactFocus })
    }
  }
}
