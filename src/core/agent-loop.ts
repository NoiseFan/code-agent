import type { AgentLoopOptions, ContentBlock, Message, ToolResultBlock } from '../types'
import * as process from 'node:process'
import Anthropic from '@anthropic-ai/sdk'
import { config } from 'dotenv'
import pc from 'picocolors'
import 'dotenv/config'

export const WORKDIR: string = process.cwd()
config({ path: WORKDIR, override: true, quiet: true })

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
})

export async function agentLoop(messages: Message[], options: AgentLoopOptions): Promise<void> {
  const { handlers } = options
  const system = options.system ?? `You are a coding agent at ${WORKDIR}, use tools to solve tasks. Act, don't explain.`
  const anthropicTools: Anthropic.Messages.Tool[] = options.tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
  }))

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

    const results: ToolResultBlock[] = []
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const toolBlock = block as Anthropic.Messages.ToolUseBlock
        const handler = handlers[toolBlock.name]
        if (!handler) {
          console.log(pc.red(`Unknow tools:${toolBlock.name}`))
          results.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: `Error: Unknow tool "${toolBlock.name}"`,
          })
        }
        // 打印工具调用
        console.log(pc.yellow(toolBlock.name))

        // 执行工具
        const output = await handler(toolBlock.input as Record<string, unknown>)
        console.log(output.slice(0, 200))

        results.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: output,
        })
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
