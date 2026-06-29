import type { PromptOpts } from '../types'
import { initPrompt, welcome } from '../core'
import { agentLoopWithRecovery } from '../core/agent-loop/recovery'
import { WORKDIR } from '../core/runtime'
import { BASE_HANDLERS, BASE_TOOLS } from '../core/tools'
import { SystemPromptBuilder } from '../persistence/prompt'
import { extractTextReply } from '../utils/agent-loop'

const system = [
  `You are a coding agent at ${WORKDIR}. Use tools to solve tasks.`,
  '',
  'This agent has error recovery enabled:',
  '- If you output is truncated, you will be asked to continue automatically.',
  '- If the context grows too large, it will be compacted automatically.',
  '- If the API has transient errors, retries will happen with exponential backoff',
]
async function prompt(opts: PromptOpts) {
  const { history, readLine } = opts

  const systemPrompt = new SystemPromptBuilder({
    tools: BASE_TOOLS,
    baseSystem: system.join('\n'),
  })
  systemPrompt.notify()

  while (true) {
    const initResult = await initPrompt({ prefix: '11', readLine, history, option: { systemPrompt } })
    if (initResult.type === 'command')
      continue
    if (initResult.type === 'exit')
      break

    await agentLoopWithRecovery(history, { handlers: BASE_HANDLERS, systemBuilder: systemPrompt })
    extractTextReply(history)
  }
}

prompt(welcome({ section: 's11 - error recovery' }))
