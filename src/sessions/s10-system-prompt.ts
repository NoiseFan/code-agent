import type { PromptOpts, ToolHandler } from '../types'
import { initPrompt, welcome } from '../core'
import { agentLoopWithSystemPrompt } from '../core/agent-loop/system'
import { WORKDIR } from '../core/runtime'
import { BASE_HANDLERS, BASE_TOOLS, saveMemory } from '../core/tools'
import { MEMORY_GUIDANCE, MemoryManger } from '../persistence/memory'
import { SystemPromptBuilder } from '../persistence/prompt'
import { extractTextReply } from '../utils/agent-loop'

const system = [
  `You are a coding agent at ${WORKDIR}. Use tools to solve tasks.`,
  'You have a memory system the persists information across sessions.',
  'When you learnn something worth remebering, use save_memory to save it.',
  MEMORY_GUIDANCE,
]

async function prompt(opts: PromptOpts) {
  const { history, readLine } = opts

  // 1. 创建 memoryManger 并加载记忆
  const memoryManager = new MemoryManger()
  memoryManager.init()

  // 2. 创建 systemPrompt
  const systemPrompt = new SystemPromptBuilder({
    tools: BASE_TOOLS,
    memoryManager,
    baseSystem: system.join('\n'),
  })
  systemPrompt.notify()

  const handlers: Record<string, ToolHandler> = {
    ...BASE_HANDLERS,
    save_memory: input => saveMemory(input, memoryManager, systemPrompt),
  }

  while (true) {
    const initResult = await initPrompt({ prefix: '10', readLine, history, option: { memory: memoryManager, systemPrompt } })
    if (initResult.type === 'command')
      continue
    if (initResult.type === 'exit')
      break

    await agentLoopWithSystemPrompt(history, {
      handlers,
      systemBuilder: systemPrompt,
      memory: memoryManager,
    })

    extractTextReply(history)
  }
}

prompt(welcome({ section: 's10 - system prompt' }))
