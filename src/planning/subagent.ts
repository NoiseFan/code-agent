import type { Message, SubAgentContext, ToolDefinition, ToolHandler } from '../types'
import * as pi from 'picocolors'
import { WORKDIR } from '../core/agent-loop'
import { BASE_HANDLERS, BASE_TOOLS } from '../core/tools'

// 子 Agent 最大
const MAX_SUBAGENT_TURNS = 30

const SUBAGENT_SYSTEM = `You are a coding subagent as ${WORKDIR}. Complete the given task, the summarize your findings. Be concise in your final summay.`

export const TASK_TOOL_DEFINITION: ToolDefinition = {
  name: 'task',
  description: 'Launch a subagent with isolated context for exploration tasks. Use this when: (1) analyzing/searching multiple files or directories, (2) gathering information across codebase, (3) the task needs multiple steps but only final summary matters. Returns only the summary, keeping parent context clean.',
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
    systemPrompt: prompt,
    messages: subMessages,
    tools: BASE_TOOLS,
    handlers: BASE_HANDLERS,
    maxTurn: MAX_SUBAGENT_TURNS,

  }
  return ''
}

export function createTaskHandler(): ToolHandler {
  return async (input: Record<string, unknown>): Promise<string> => {
    const prompt = input.prompt as string | undefined
    const description = input.description as string | undefined
    if (!prompt)
      return 'Error: prompt is required'

    console.log(pi.yellow(`task (${description || 'subtask'}): ${(prompt as string).slice(0, 80)}(${(prompt as string).length > 80 ? '...' : ''}`))

    // 运行子 Agent
    const summary = await runSubAgent(prompt)
    // 打印摘要（截断显示）
    console.log(pi.yellow(`${summary.slice(0, 200)}${summary.length > 200 ? '...' : ''}`))
    return ''
  }
}
