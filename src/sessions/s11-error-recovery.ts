import type { PromptOpts } from '../types'
import { initPrompt, welcome } from '../core'
import { agentLoopWithRecovery } from '../core/agent-loop/recovery'
import { BASE_HANDLERS, BASE_TOOLS } from '../core/tools'
import { SystemPromptBuilder } from '../persistence/prompt'
import { extractTextReply } from '../utils/agent-loop'

async function prompt(opts: PromptOpts) {
  const { history, readLine } = opts

  const systemPrompt = new SystemPromptBuilder({ tools: BASE_TOOLS })
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
