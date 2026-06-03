import type { PromptOpts, ToolDefinition, ToolHandler } from '../types'
import { config } from 'dotenv'
import pc from 'picocolors'
import { initPrompt, resolvePrompt, welcome } from '../core'
import { agentLoop, extractTextReply } from '../core/agent-loop'
import { WORKDIR } from '../core/runtime'
import { BASE_HANDLERS, BASE_TOOLS } from '../core/tools'
import { createLoadSkillHandler, LOAD_SKILL_TOOL_DEFINITION, SKILLRegistry } from '../planning/skill-loader'

config({ override: true, quiet: true })
const skillRegistry = new SKILLRegistry()

function createSystemPrompt(): string {
  return `You are a coding agent at ${WORKDIR}.
<skill_avaiable>
${skillRegistry.describeAvailable()}
</skill_avaiable>

Use load_skills when a task needs specialized instructions before you act.
`
}
const TOOLS: Array<ToolDefinition> = [...BASE_TOOLS, LOAD_SKILL_TOOL_DEFINITION]
const HANDLERS: Record<string, ToolHandler> = {
  ...BASE_HANDLERS,
  load_skill: createLoadSkillHandler(skillRegistry),
}

async function prompt(opts: PromptOpts) {
  const { history, readLine } = opts
  readLine.question(pc.cyan('05>>>'), async (query: string) => {
    initPrompt({ query, readLine, history })

    await skillRegistry.ready
    try {
      await agentLoop(history, {
        system: createSystemPrompt(),
        tools: TOOLS,
        handlers: HANDLERS,
      })
      extractTextReply(history)
    }
    catch (e) {
      console.error(e)
    }
    await resolvePrompt({ history, fileName: '05-skill-load', readLine, prompt })
  })
}

prompt(welcome({ section: 's05 - Skills', desc: 'Discover cheap, load when needed' }))
