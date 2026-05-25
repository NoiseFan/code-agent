import type { Message } from '../types'
import * as process from 'node:process'
import readline from 'node:readline'
import { config } from 'dotenv'
import pc from 'picocolors'
import { agentLoop, WORKDIR } from '../core/agent-loop'
import 'dotenv/config'
import type { ToolDefinition } from '../types';

config({ override: true, quiet: true })
const TOOLS:ToolDefinition[] = []
cosnt HANDLERS:Record<string,ToolHandler> = {bash:runBash}

function welcome() {
  console.info(pc.cyan('╔════════════════════════════════════╗'))
  console.info(pc.cyan('║  s01 - Agent Loop                  ║'))
  console.info(pc.cyan('║  "One loop & Bash is all you need" ║'))
  console.info(pc.cyan('╚════════════════════════════════════╝'))
  console.info()
}

function checkAPIKey() {
  if (!process.env.API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error(pc.red('API key not set'))
    console.error(pc.red('Please copy .env.example to .env and add your API Key'))
  }
  else {
    console.log(`Working directory: ${WORKDIR}`)
    console.log('Type "q" or "exit" to quit.\n')
  }
}

function main() {
  welcome()
  checkAPIKey()
  const history: Message[] = []
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  function prompt() {
    rl.question('01>>', async (query: string) => {
      const trimmed = query.trim().toLocaleLowerCase()
      if (['q', 'exit', ''].includes(trimmed)) {
        rl.close()
        console.log('GoodBye!')
      }
      history.push({ role: 'user', content: query })

      try{
        await agentLoop(history,{tools:TOOLS,handlers:HANDLERS})
      }
      console.log(history)
      prompt()
    })
  }

  prompt()
}

main()
