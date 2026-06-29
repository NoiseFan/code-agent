import type { Anthropic } from '@anthropic-ai/sdk'
import type { AgentLoopOptions, Message } from '../../types'
import pc from 'picocolors'
import { convertTools } from '..'
import { accurateCalculation, autoCompact, CONTEXT_LIMIT } from '../../persistence/compact'
import { backoffDelay, chooseRecovery, classifyError, CONTINUATION_MESSAGE, MAX_RECOVERY_ATTEMPTS } from '../../persistence/recovery'
import { execTools } from '../../utils/agent-loop'
import { client, MODEL } from '../runtime'
import { BASE_TOOLS } from '../tools'

export async function agentLoopWithRecovery(
  messages: Array<Message>,
  opts: AgentLoopOptions,
): Promise<void> {
  const { systemBuilder, handlers, tools = BASE_TOOLS } = opts
  const anthropicTools = convertTools(tools)

  // 连续 max_tokens 截断计数器
  let maxOutputRecoveryCount = 0

  while (true) {
    // 1. 构建系统提示词
    const system = systemBuilder?.build() || ''
    let response: Anthropic.Messages.Message | null = null

    // 2. 调用模型
    for (let attempt = 0; attempt < MAX_RECOVERY_ATTEMPTS; attempt++) {
      try {
        response = await client.messages.create({
          model: MODEL,
          system,
          tools: anthropicTools,
          messages,
          max_tokens: 8_000,
        })
        // 成功调用，跳出重试循环
        break
      }
      catch (e) {
        const recovery = await handleAPIError(e as Error, attempt, messages)
        if (recovery === 'retry')
          continue
        return
      }
    }
    if (!response) {
      console.log(pc.red(`[Error] No response received after all retries.`))
      return
    }

    // 3. 记录 assistant 回复
    messages.push({ role: 'assistant', content: response.content })

    // 策略1：max_token 截断
    if (response.stop_reason === 'max_tokens') {
      maxOutputRecoveryCount++
      if (maxOutputRecoveryCount <= MAX_RECOVERY_ATTEMPTS) {
        console.log(pc.red(`[Recovery] max_token hit ${maxOutputRecoveryCount} / ${MAX_RECOVERY_ATTEMPTS}`))
        messages.push({ role: 'user', content: CONTINUATION_MESSAGE })
        // 重试
        continue
      }
      console.log(`[Error] max_tokens recovery exhausted. Stoping.`)
      return
    }

    // 4. 如果模型决定停止，则退出循环
    if (response.stop_reason !== 'tool_use')
      return

    // 5. 处理工具调用
    const result = await execTools(response, { handlers })

    // 6. 将结果追加回消息
    messages.push({ role: 'user', content: result })

    // 策略2： 使用 tokenlizer 主动检查
    const estimatedTokens = accurateCalculation(messages)
    if (estimatedTokens > CONTEXT_LIMIT) {
      console.log(pc.red(`[Recovery] Token estimate ${estimatedTokens} exceeds threshold ${CONTEXT_LIMIT}. Auto-compacting...`))
      await autoCompact(messages)
    }
  }
}

/**
 * 处理 LLM 调用错误
 */
async function handleAPIError(error: Error, attempt: number, messages: Array<Message>): Promise<'retry' | 'abort'> {
  const category = classifyError(error)
  const decision = chooseRecovery(category, attempt)

  // 1. 检查是否还有重试次数
  if (attempt >= MAX_RECOVERY_ATTEMPTS) {
    console.log(pc.red(`[Error] ${decision.reason} (all ${MAX_RECOVERY_ATTEMPTS} retries exhausted).`))
    return 'abort'
  }
  console.log(pc.yellow(`[Recovery] ${decision.reason} (attempt ${attempt + 1} / ${MAX_RECOVERY_ATTEMPTS})`))

  // 2. 上下文溢出
  if (decision.action === 'compact') {
    await autoCompact(messages)
    return 'retry'
  }

  // 3. 网络错误
  if (decision.action === 'backoff') {
    const delay = backoffDelay(attempt)
    console.log(pc.red(`[Recovery] Waiting ${Math.round(delay / 1000)}s before retry...`))
    await new Promise(resolve => setTimeout(resolve, delay))
    return 'retry'
  }

  // 4. 未知错误，无法恢复
  console.log(pc.red(`[Error] ${decision.reason}`))
  return 'abort'
}
