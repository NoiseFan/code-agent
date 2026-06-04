import type { Anthropic } from '@anthropic-ai/sdk'
import type readline from 'node:readline'
import type { PermissionManager } from '../../persistence/permission'
import type { AgentLoopOptions, ContentBlock, Message, ToolHandler, ToolInput, ToolResultBlock } from '../../types'
import { convertTools } from '..'
import { client, MODEL } from '../runtime'
import { BASE_HANDLERS } from '../tools'

export async function agentLoopWithPermission(messages: Message[], options: AgentLoopOptions): Promise<void> {
  const { system, tools, handlers, perms, readline } = options
  const anthropicTools = convertTools(tools)

  while (true) {
    // 1. 调用 LLM
    const response = await client.messages.create({
      model: MODEL,
      system,
      messages,
      tools: anthropicTools,
      max_tokens: 8_000,
    })

    // 2. 记录 assistant 回复
    const assistantContent = transformAssistant(response.content)
    messages.push({ role: 'assistant', content: assistantContent })

    // 3. 如果模型决定停止，退出循环
    if (response.stop_reason !== 'tool_use')
      return

    // 4. 调用工具
    await execTool(response, { handlers, perms, readline })
  }
}

function transformAssistant(block: ContentBlock): ContentBlock {
  // todo 没搞懂，这里为什么做这一层的转换
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text }
    case 'tool_use':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input }
    default:
      // 将 thinking block 等，转换为 text
      return { type: 'text', text: JSON.stringify(block) }
  }
}
async function execTool(
  response: Anthropic.Message,
  context: {
    readLine: readline.Interface
    handlers: Record<string, ToolHandler>
    perms: PermissionManager | undefined
  },
): Promise<Array<ToolResultBlock>> {
  const { handlers, perms, readLine } = context
  const results: ToolResultBlock[] = []
  if (!perms)
    return results

  for (const block of response.content) {
    // 1. 排除边界条件
    if (block.type !== 'tool_use')
      continue

    const { name: toolName, input: toolInput } = block

    // 2. 权限检查
    const decision = perms.check(toolName, toolInput as ToolInput)
    let output: string
    const handler = BASE_HANDLERS[toolName]
    if (handler) {
      if (decision.behavior === 'allow') {
        output = handler ? await handler(toolInput as ToolInput) : `Unknow tool: ${toolName}`
        console.log(`> ${toolName}: ${output.slice(0, 200)}`)
      }
      else if (decision.behavior === 'ask') {
        const answer = await new Promise<string>((resolve) => {
          readLine.question('  Allow? (y/n/always): ', resolve)
        }) as 'y' | 'yes' | 'n' | 'always'
        const answerLowCase = answer.toLowerCase()
      }
    }
    else {
      output = `Unknow tool: ${toolName}`
    }

    results.push({
      type: 'tool_result',
      tool_use_id: block.id,
      content: output,
    })
  }

  return results
}
