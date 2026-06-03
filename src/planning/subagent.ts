import type { Anthropic } from '@anthropic-ai/sdk'
import type { Message, SubAgentContext, ToolDefinition, ToolHandler } from '../types'
import pc from 'picocolors'
import { convertTools } from '../core'
import { execTool } from '../core/agent-loop'
import { client, MODEL, WORKDIR } from '../core/runtime'
import { BASE_HANDLERS, BASE_TOOLS } from '../core/tools'
import { writeJSONFile } from '../utils/write'

// 子 Agent 最大
const MAX_SUBAGENT_TURNS = 30

const SUBAGENT_SYSTEM = `You are a coding subagent as ${WORKDIR}. Complete the given task, the summarize your findings. Be concise in your final summay.`

export const TASK_TOOL_DEFINITION: ToolDefinition = {
  name: 'task',
  description: `Launch a subagent with isolated context for exploration tasks.
  Use this when: (1) analyzing/searching multiple files or directories,
  (2) gathering information across codebase,
  (3) the task needs multiple steps but only final summary matters.
  Returns only the summary, keeping parent context clean.`,
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The specific task for the subagent to complete.',
      },
      description: {
        type: 'string',
        description: 'Short label for this task (e.g., "analyze core", "find tests")',
      },
    },
    required: ['prompt'],
  },
}

async function runSubAgent(prompt: string): Promise<string> {
  // 1. 创建空白上下文
  const subMessages: Message[] = [{ role: 'user', content: prompt }]

  // 2. 子 Agent 配置
  const context: SubAgentContext = {
    systemPrompt: SUBAGENT_SYSTEM,
    messages: subMessages,
    tools: BASE_TOOLS,
    handlers: BASE_HANDLERS,
    maxTurns: MAX_SUBAGENT_TURNS,
  }

  const anththorpicTools = convertTools(context.tools)

  // 3. 循环执行，最多 maxTurn 轮
  let lastResponse: Anthropic.Messages.Message | null = null

  for (let turn = 0; turn < context.maxTurns; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      system: context.systemPrompt,
      messages: context.messages,
      tools: anththorpicTools,
      max_tokens: 8_000,
    })

    lastResponse = response
    context.messages.push({ role: 'assistant', content: response.content })

    // 如果模型决定停止，退出循环
    if (response.stop_reason !== 'tool_use')
      break

    // 执行工具调用
    const results = await execTool(response, { handlers: context.handlers })

    // 将结果追加回历史会话列表
    context.messages.push({ role: 'user', content: results })
  }

  await writeJSONFile({ path: './.tmp/00-sub-agent.json', content: subMessages })
  // 4. 仅返回最终文本摘要（中间过程丢弃）
  if (lastResponse) {
    const textBlocks = lastResponse.content.filter(b => b.type === 'text')
    if (textBlocks.length > 0) {
      return textBlocks.map(b => b.text).join('\n')
    }
  }

  return '(no summary)'
}

export function createTaskHandler(): ToolHandler {
  return async (input: Record<string, unknown>): Promise<string> => {
    const prompt = input.prompt as string | undefined
    const description = input.description as string | undefined
    if (!prompt)
      return 'Error: prompt is required'

    console.log(pc.cyan(`task (${description || 'subtask'}): ${(prompt as string).slice(0, 80)}(${(prompt as string).length > 80 ? '...' : ''}`))

    // 运行子 Agent
    const summary = await runSubAgent(prompt)
    // 打印摘要（截断显示）
    console.log('SubAgent result:', pc.magenta(`${summary.slice(0, 200)}${summary.length > 200 ? '...' : ''}`))
    return summary
  }
}
