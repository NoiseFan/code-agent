import type { MemoryManger } from '../../persistence/memory'
import type { Message, ToolHandler } from '../../types'
import { convertTools } from '..'
import { MEMORY_GUIDANCE } from '../../persistence/memory'
import { execTools, transformAssistant } from '../../utils/agent-loop'
import { client, MODEL } from '../runtime'
import { BASE_HANDLERS, BASE_TOOLS, createMemoryTools } from '../tools'

export async function agentLoopWithMemory(
  opts: {
    messages: Array<Message>
    system: string
    memoryManager: MemoryManger
  },
): Promise<void> {
  const { messages, system, memoryManager } = opts
  const tools = convertTools(BASE_TOOLS)

  const handlers: Record<string, ToolHandler> = {
    ...BASE_HANDLERS,
    ...createMemoryTools(memoryManager),
  }

  while (true) {
    // 1. 每次调用时均重新构建提示词，包含最新记忆
    const systemPrompt = buildSystemPrompt(system, memoryManager)

    // 2. 调用模型
    const response = await client.messages.create({
      model: MODEL,
      system: systemPrompt,
      messages,
      tools,
      max_tokens: 8_000,
    })

    // 3. 记录 assistant 回复
    const assistantContent = response.content.map(transformAssistant)
    messages.push({ role: 'assistant', content: assistantContent })

    // 4. 如果模型决定停止，退出循环
    if (response.stop_reason !== 'tool_use')
      return

    // 5. 处理工具调用
    const results = await execTools(response, { handlers })

    // 6. 将结果追加回消息
    messages.push({ role: 'user', content: results })
  }
}

function buildSystemPrompt(systemPrompt: string, memoryManager: MemoryManger): string {
  const parts = [systemPrompt]

  // 注入记忆内容
  const memorySection = memoryManager.loadMemoryPrompt()
  if (memorySection)
    parts.push(memorySection)

  // 注入到记忆指南
  parts.push(MEMORY_GUIDANCE)

  return parts.join('\n\n')
}
