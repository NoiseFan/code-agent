import type { Message, ToolDefinition, ToolHandler } from '../types'
import * as process from 'node:process'
import readline from 'node:readline'
import { config } from 'dotenv'
import pc from 'picocolors'
import { exit, welcome } from '../core'
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

async function prompt(readLine: readline.Interface, history: Message[]) {
  readLine.question(pc.cyan('04>>'), async (query: string) => {
    const trimmed = query.trim()
    exit(trimmed, readLine)

    history.push({ role: 'user', content: query })
    try {
      await agentLoop(history, { system, tools: TOOLS, handlers: HANDLER })
      await writeJSONFile({ path: './.tmp/04-subagent.json', content: history })
      const reply = extractTextReply(history)
      if (reply)
        console.log(reply)
    }
    catch (error) {
      console.error(error)
    }
  })
}

function main() {
  welcome({ section: 's04 - Subagent', desc: 'Fresh context, clean parent' })
  const history: Message[] = []
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  prompt(rl, history)
}

main()
