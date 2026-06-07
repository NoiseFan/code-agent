import type { Anthropic } from '@anthropic-ai/sdk'
import type { HookManager } from '../../persistence/hooks'
import type { AgentLoopOptions, Message, ToolInput, ToolResultBlock } from '../../types'
import type { HookContext } from '../../types/hooks'
import { convertTools } from '..'
import { transformAssistant } from '../../utils/agent-loop'
import { client, MODEL } from '../runtime'
import { BASE_HANDLERS } from '../tools'

export async function agentLoopWithHooks(messages: Array<Message>, opts: AgentLoopOptions) {
  const { system, tools, hooks } = opts
  const anthropicTools = convertTools(tools)

  while (true) {
    // 1. 调用模型
    const response = await client.messages.create({
      model: MODEL,
      system,
      messages,
      tools: anthropicTools,
      max_tokens: 8000,
    })

    // 2. 记录 assistant 回复
    const assistantContent = transformAssistant(response.content)
    messages.push({ role: 'assistant', content: assistantContent })

    // 3. 如果模型决定停止，退出循环
    if (response.stop_reason !== 'tool_use')
      return

    // 4. 处理工具调用
    const results = await execTools(response, { hooks })

    // 5. 将结果追加回消息
    messages.push({ role: 'user', content: results })
  }
}

async function execTools(
  response: Anthropic.Message,
  opts: { hooks: HookManager | undefined },
): Promise<Array<ToolResultBlock>> {
  const { hooks } = opts
  const results: Array<ToolResultBlock> = []

  for (const block of response.content) {
    if (block.type !== 'tool_use')
      continue
    const toolName = block.name
    const toolInput = block.input as ToolInput

    // 1. 构建 Hook 上下文
    const hookContext: HookContext = {
      tool_name: toolName,
      tool_input: toolInput,
    }

    // 2. 处理前置钩子
    if (hooks) {
      const preResult = hooks.runHooks('PreToolUse', hookContext)

      // 处理 Hook 注入的消息
      for (const msg of preResult.messages) {
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `[Hook message] ${msg}`,
        })
      }

      if (preResult.blocked) {
        const reason = preResult.blockReson || 'Blocked by hook'
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Tool blocked by PreToolUse hook: ${reason}`,
        })

        console.warn(`  [BLOCKED] ${toolName}: ${reason}`)
        // 不执行工具，继续处理下一个工具调用
        continue
      }
    }

    // 3. 执行工具
    const handler = BASE_HANDLERS[block.name]
    let output: string

    try {
      output = handler ? await handler(toolInput) : `Unkonw tool: ${toolName}`
    }
    catch (e) {
      output = `Error: ${(e as Error).message}`
    }
    console.log(`> ${toolName}: ${output.slice(0, 200)}`)

    // 4. 处理后置钩子
    if (hooks) {
      // 将输出添加到上下文中
      hookContext.tool_output = output
      const postResult = hooks.runHooks('PostToolUse', hookContext)

      // 处理 PostToolUse Hook 注入的消息
      for (const msg of postResult.messages) {
        output += `\n [Hook note]: ${msg}`
      }
    }

    // 工具调用结果
    results.push({
      type: 'tool_result',
      tool_use_id: block.id,
      content: output,
    })
  }

  return results
}
