import type readline from 'node:readline'
import type { Message, PromptOpts, ToolDefinition, ToolHandler } from '../types'
import { resolve } from 'node:dns'
import * as process from 'node:process'
import { config } from 'dotenv'
import pc from 'picocolors'
import { exit, initPrompt, resolvePrompt, welcome } from '../core'
import { agentLoop, extractTextReply, WORKDIR } from '../core/agent-loop'
import { BASE_HANDLERS, BASE_TOOLS, runWrite } from '../core/tools'
import { createTaskHandler, TASK_TOOL_DEFINITION } from '../planning/subagent'
import { writeJSONFile } from '../utils/write'

config({ override: true, quiet: true })

const TOOLS: ToolDefinition[] = [...BASE_TOOLS, TASK_TOOL_DEFINITION]
const HANDLER: Record<string, ToolHandler> = { ...BASE_HANDLERS, task: createTaskHandler() }

// s04 系统提示词（智能判断何时使用 task）
const system = `You are a coding agent at ${WORKDIR}.

<task_tool_guidance>
Use the task tool when the request involves:
- Analyzing, exploring, or searching multiple files/directories
- Finding patterns or gathering information across the codebase
- Tasks where intermediate steps are noise but final summary matters
- Requests starting with "analyze", "find", "search", "list", "explore"

Do NOT use task tool for:
- Single file operations (read/edit one file)
- Simple bash commands
- Tasks that need current conversation context
</task_tool_guidance>

The task tool spawns a subagent with fresh messages. This keeps the parent context clean.
Directly handle simple tasks; delegate complex exploration to subagent.`

async function prompt(opts: PromptOpts) {
  const { readLine, history } = opts
  readLine.question(pc.cyan('04>>'), async (query: string) => {
    initPrompt({ query, readLine, history })

    try {
      await agentLoop(history, { system, tools: TOOLS, handlers: HANDLER })
      const reply = extractTextReply(history)
      if (reply)
        console.log(reply)
    }
    catch (error) {
      console.error(error)
    }

    await resolvePrompt({ history, fileName: 's04-subageent', readLine, prompt })
  })
}

prompt(welcome({ section: 's04 - Subagent', desc: 'Fresh context, clean parent' }))
