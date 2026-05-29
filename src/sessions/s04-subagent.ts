import type { Message, ToolDefinition } from '../types'
import * as process from 'node:process'

import readline from 'node:readline'

import { config } from 'dotenv'

import { welcome } from '../core'
import { WORKDIR } from '../core/agent-loop'
import { BASE_TOOLS } from '../core/tools'
import { TASK_TOOL_DEFINITION } from '../planning/subagent'

config({ override: true, quiet: true })

const TOOLS: ToolDefinition[] = [...BASE_TOOLS, TASK_TOOL_DEFINITION]

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
