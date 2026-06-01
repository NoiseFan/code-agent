import type { PromptOpts, ToolDefinition, ToolHandler } from '../types'
import { config } from 'dotenv'
import pc from 'picocolors'
import { initPrompt, resolvePrompt, welcome } from '../core'
import { agentLoop, extractTextReply } from '../core/agent-loop'
import { BASE_TOOLS, runBash } from '../core/tools'
import { writeJSONFile } from '../utils/write'
import 'dotenv/config'

config({ override: true, quiet: true })
const TOOLS: ToolDefinition[] = [BASE_TOOLS[0]]
const HANDLERS: Record<string, ToolHandler> = { bash: runBash }

async function prompt(opts: PromptOpts) {
  const { readLine, history } = opts
  readLine.question(pc.cyan('01>>'), async (query: string) => {
    initPrompt({ query, readLine, history })

    try {
      await agentLoop(history, { tools: TOOLS, handlers: HANDLERS })
      await writeJSONFile({ path: './.tmp/01-agent-loop.json', content: history })
      const reply = extractTextReply(history)
      if (reply)
        console.log(reply)
    }
    catch (e) {
      console.error(pc.red(e as string))
    }
    await resolvePrompt({ history, fileName: '01-Agent-loop', readLine, prompt })
  })
}

prompt(welcome({ section: 's01 - Agent Loop', desc: 'One loop & Bash is all you need' }))
