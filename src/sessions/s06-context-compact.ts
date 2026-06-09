import type { PromptOpts, ToolDefinition } from '../types'
import pc from 'picocolors'
import { initPrompt, resolvePrompt, welcome } from '../core'
import { agentLoopWithCompact } from '../core/agent-loop/compact'
import { WORKDIR } from '../core/runtime'
import { BASE_TOOLS } from '../core/tools'
import { COMPACT_TOOL_DEFINITION, createCompactState } from '../persistence/compact'
import { extractTextReply } from '../utils/agent-loop'

const compactState = createCompactState()
const TOOLS: Array<ToolDefinition> = [...BASE_TOOLS, COMPACT_TOOL_DEFINITION]
const SYSTEM = `You are a coding agent at ${WORKDIR}. Keep working step by step, and use compact if the conversation gets too lang.`

async function prompt(opts: PromptOpts) {
  const { readLine, history } = opts

  readLine.question(pc.cyan('06>>'), async (query: string) => {
    initPrompt({ query, readLine, history })

    try {
      await agentLoopWithCompact(history, {
        system: SYSTEM,
        state: compactState,
        tools: TOOLS,
      })
      extractTextReply(history)
    }
    catch (e) {
      console.error(e)
    }
    resolvePrompt({ history, fileName: '06-context-compact', readLine, prompt })
  })
}
prompt(welcome({ section: 's06 - context compact', desc: 'Keep working, keep compact' }))
