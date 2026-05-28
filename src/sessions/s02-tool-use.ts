import type { Message } from '../types'
import * as process from 'node:process'
import readline from 'node:readline'
import { config } from 'dotenv'
import pc from 'picocolors'
import { agentLoop, extractTextReply, WORKDIR } from '../core/agent-loop'
import { BASE_HANDLERS, BASE_TOOLS, runWrite } from '../core/tools'
import 'dotenv/config'

config({ override: true, quiet: true })

function welcome() {
  console.info(pc.cyan('╔════════════════════════════════════╗'))
  console.info(pc.cyan('║  s02 - Tool Use                    ║'))
  console.info(pc.cyan('║  "Add tools = add a handler"       ║'))
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

async function prompt(readLine: readline.Interface, history: Message[]) {
  readLine.question(pc.cyan('02>>'), async (query: string) => {
    const trimmed = query.trim().toLocaleLowerCase()
    if (['q', 'exit', ''].includes(trimmed)) {
      readLine.close()
      console.log('GoodBye!')
    }
    history.push({ role: 'user', content: query })

    try {
      await agentLoop(history, { tools: BASE_TOOLS, handlers: BASE_HANDLERS })
      const reply = extractTextReply(history)
      if (reply)
        console.log(reply)
    }
    catch (e) {
      console.error(pc.red(e as string))
    }
    console.log(JSON.stringify(history))
    await runWrite({ path: './.tmp/02-tool-use.json', content: JSON.stringify(history) })
    await prompt(readLine, history)
  })
}

function main() {
  welcome()
  checkAPIKey()
  const history: Message[] = []
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  prompt(rl, history)
}

main()
