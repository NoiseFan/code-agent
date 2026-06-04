import type { PromptOpts, ToolDefinition, ToolHandler } from '../types'
import { config } from 'dotenv'
import pc from 'picocolors'
import { initPrompt, resolvePrompt, welcome } from '../core'
import { agentLoop } from '../core/agent-loop/simple'
import { WORKDIR } from '../core/runtime'
import { BASE_HANDLERS, BASE_TOOLS } from '../core/tools'
import { createTodoHandler, TODO_TOOL_DEFINTION, TodoManger } from '../planning/todo'
import { extractTextReply } from '../utils/agent-loop'

config({ override: true, quiet: true })

const SYSTEM_PROMPT = `You are a coding agent as ${WORKDIR}.
Use the todo tool for mutil-step work.
Keep exactly one step in_progress when a task hash multiple steps.
Refresh the plan as work advances. Prefer tools over prose`
const todoManager = new TodoManger()
const TOOLS: Array<ToolDefinition> = [...BASE_TOOLS, TODO_TOOL_DEFINTION]
const HANDLERS: Record<string, ToolHandler> = {
  ...BASE_HANDLERS,
  todo: createTodoHandler(todoManager),
}

async function prompt(opts: PromptOpts) {
  const { readLine, history } = opts
  readLine.question(pc.cyan('03>>'), async (query: string) => {
    initPrompt({ query, readLine, history })
    try {
      await agentLoop(history, {
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        handlers: HANDLERS,
        todoManager,
      })
      extractTextReply(history)
    }
    catch (e) {
      console.error(pc.red(e as string))
    }

    await resolvePrompt({ history, fileName: '03-todo-write', readLine, prompt })
  })
}
prompt(welcome({ section: 's03 - TodoWrite', desc: 'No plan, agent drifts' }))
