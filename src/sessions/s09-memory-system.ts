import type { PromptOpts } from '../types'
import { initPrompt, resolvePrompt, welcome } from '../core'
import { agentLoopWithMemory } from '../core/agent-loop/memory'
import { WORKDIR } from '../core/runtime'
import { MemoryManger } from '../persistence/memory'
import { extractTextReply } from '../utils/agent-loop'

const system = [
  `You are a coding agent at ${WORKDIR}. Use tools to solve tasks.`,
  'You have a memory system the persists information across sessions.',
  'When you learnn something worth remebering, use save_memory to save it.',
]

async function prompt(opts: PromptOpts) {
  const { history, readLine } = opts

  const memoryManager = new MemoryManger()
  memoryManager.loadAll()

  if (memoryManager.memories.size) {
    console.log(`[${memoryManager.memories.size} memories loaded into context]`)
  }
  else {
    console.log('[No existing memories. The agent can create them with save_mamory.]')
  }

  while (true) {
    const query = await initPrompt({ prefix: '09', readLine, history, option: memoryManager })

    if (query.trim() === 'memory') {
      if (memoryManager.memories.size) {
        console.log('Current memories:')
        for (const [name, mem] of memoryManager.memories) {
          console.log(`  [${mem.type}] ${name}: ${mem.description}`)
        }
      }
      else {
        console.log('  (no memories)')
      }
      continue
    }

    try {
      await agentLoopWithMemory({
        messages: history,
        system: system.join('\n'),
        memoryManager,
      })

      extractTextReply(history)
    }
    catch (e) {
      console.error(e)
    }
    resolvePrompt({ history, fileName: '09-memory-system', readLine, prompt })
  }
}

prompt(welcome({ section: 's09 - memory system' }))
