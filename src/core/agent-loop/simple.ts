import type { AgentLoopOptions, ContentBlock, Message } from '../../types'
import pc from 'picocolors'
import { execTools } from '../../utils/agent-loop'
import { convertTools } from '../index'
import { client, MODEL, WORKDIR } from '../runtime'

export async function agentLoop(messages: Message[], options: AgentLoopOptions): Promise<void> {
  const { handlers, todoManager, tools } = options
  const system = options.system ?? `You are a coding agent at ${WORKDIR}, use tools to solve tasks. Act, don't explain.`
  const anthropicTools = convertTools(tools)

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

    // 4. 执行工具
    let useTodo = false
    const results = await execTools(response, {
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
