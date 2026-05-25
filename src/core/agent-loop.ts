import type { AgentLoopOptions, ContentBlock, Message } from '../types'
import * as process from 'node:process'
import Anthropic from '@anthropic-ai/sdk'

export const WORKDIR: string = process.cwd()
const MODEL = process.env.MODEL || 'claude-sonnet-4-20250514'
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
})

export async function agentLoop(messages: Message[], options: AgentLoopOptions) {
  const system = options.system ?? `You are a coding agent at ${WORKDIR}, use tools to solve tasks. Act, don't explain.`

  while (true) {
    // 1. 调用 LLM
    const response = await client.messages.create({
      model: MODEL,
      system,
      messages,
      max_tokens: 8000,
    })

    // 记录 assistant 回复
    messages.push({
      role: 'assistant',
      content: response.content as ContentBlock[],
    })

    // 4. 如果模型决定停止，退出循环
    if (response.stop_reason !== 'tool_use')
      return
  }
}
