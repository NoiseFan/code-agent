import type { PromptOpts } from '../types'
import { config } from 'dotenv'
import pc from 'picocolors'
import { initPrompt, resolvePrompt, welcome } from '../core'
import { agentLoop } from '../core/agent-loop/simple'
import { BASE_HANDLERS, BASE_TOOLS } from '../core/tools'
import { extractTextReply } from '../utils/agent-loop'
import 'dotenv/config'

config({ override: true, quiet: true })

async function prompt(opts: PromptOpts) {
  const { readLine, history } = opts
  readLine.question(pc.cyan('02>>'), async (query: string) => {
    initPrompt({ query, readLine, history })

    try {
      await agentLoop(
        history,
        { tools: BASE_TOOLS, handlers: BASE_HANDLERS },
      )
      extractTextReply(history)
    }
    catch (e) {
      console.error(pc.red(e as string))
    }

    await resolvePrompt({ history, fileName: '02-tool-use', readLine, prompt })
  })
}

prompt(welcome({ section: 's02 - Tool Use', desc: 'Add tools = add a handler' }))
