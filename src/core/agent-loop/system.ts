import type { TextBlock } from '@anthropic-ai/sdk/resources'
import type { AgentLoopOptions, Message } from '../../types'
import pc from 'picocolors'
import { convertTools } from '..'
import { detectPromptLeakage } from '../../persistence/prompt'
import { execTools, transformAssistant } from '../../utils/agent-loop'

import { client, MODEL } from '../runtime'
import { BASE_TOOLS } from '../tools'

/**
 * 动态组装而不是写死！
 */
export async function agentLoopWithSystemPrompt(
  messages: Array<Message>,
  opts: AgentLoopOptions,
): Promise<void> {
  const { systemBuilder, handlers } = opts
  const tools = convertTools(BASE_TOOLS)

  while (true) {
    // 1. 构建系统提示词
    const system = systemBuilder?.build() || ''

    // 2. 调用模型
    const response = await client.messages.create({
      model: MODEL,
      system,
      tools,
      messages,
      max_tokens: 8_000,
    })

    // 3. 记录 assistant 回复
    const assistantContent = response.content.map(transformAssistant)
    messages.push({ role: 'assistant', content: assistantContent })

    // 4. 检验输出

    const outputText = assistantContent.filter((b): b is TextBlock => b.type === 'text').map(b => b.text).join('\n')
    if (outputText) {
      const { leaked, similarity } = detectPromptLeakage(outputText, system)

      if (leaked)
        console.log(pc.yellow(`[Security] Possible prompt leakage detected (similarity: ${similarity}`))
    }

    // 5. 如果模型决定停止，则退出循环
    if (response.stop_reason !== 'tool_use')
      return

    // 6. 处理工具调用
    let useddMemory = false
    const result = await execTools(response, {
      handlers,
      finalCallBack: (block) => {
        if (block.name === 'save_memory')
          useddMemory = true
      },
    })

    // 7. 如果保存了记忆，清除缓存（下次重新构建稳定部分）
    if (useddMemory)
      systemBuilder?.invalidateCache()

    // 8. 将结果追加回消息
    messages.push({ role: 'user', content: result })
  }
}
