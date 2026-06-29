import type { PromptOpts, ToolHandler } from '../types'
import { initPrompt, welcome } from '../core'
import { agentLoopWithSystemPrompt } from '../core/agent-loop/system'
import { WORKDIR } from '../core/runtime'
import { BASE_HANDLERS, BASE_TOOLS, createMemoryTools } from '../core/tools'
import { MEMORY_GUIDANCE, MemoryManger } from '../persistence/memory'
import { SystemPromptBuilder } from '../persistence/prompt'
import { createTaskHandlers, TASK_PROMPT, TASK_TOOLS, TaskManager } from '../persistence/task-manager'
import { extractTextReply } from '../utils/agent-loop'

const system = [
  `You are a coding agent at ${WORKDIR}. Use tools to solve tasks.`,
  '',
  'You have a memory system the persists information across sessions.',
  'When you learnn something worth remebering, use save_memory to save it.',
  MEMORY_GUIDANCE,
  '',
  ...TASK_PROMPT,
]

async function prompt(opts: PromptOpts) {
  const { history, readLine } = opts

  // 1. 创建 TaskManager
  const taskManager = new TaskManager()

  // 2. 创建 MemoryManager 并加载记忆
  const memoryManager = new MemoryManger()
  memoryManager.loadAll()

  // 3. 创建 SystemPromptBuilder
  const systemPrompt = new SystemPromptBuilder({
    tools: [...BASE_TOOLS, ...TASK_TOOLS],
    memoryManager,
    baseSystem: system.join('\n'),
  })

  const handlers: Record<string, ToolHandler> = {
    ...BASE_HANDLERS,
    ...createMemoryTools(memoryManager, systemPrompt),
    // 任务工具
    ...createTaskHandlers(taskManager),
  }

  while (true) {
    const initResult = await initPrompt({ prefix: '12', readLine, history, option: { systemPrompt, task: taskManager } })
    if (initResult.type === 'command')
      continue
    if (initResult.type === 'exit')
      break

    await agentLoopWithSystemPrompt(history, { handlers, systemBuilder: systemPrompt, tools: [...BASE_TOOLS, ...TASK_TOOLS] })
    extractTextReply(history)
  }
}

prompt(welcome({ section: 's11 - task system' }))
