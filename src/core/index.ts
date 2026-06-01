import type { Message, PromptOpts } from '../types'
import process from 'node:process'
import readline from 'node:readline'
import pc from 'picocolors'
import { WORKDIR } from '../core/agent-loop'
import { writeJSONFile } from '../utils/write'

export function checkAPIKey(): void {
  if (!process.env.API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error(pc.red('API key not set'))
    console.error(pc.red('Please copy .env.example to .env and add your API Key'))
  }
  else {
    console.log(`Working directory: ${WORKDIR}`)
    console.log('Type "q" or "exit" to quit.\n')
  }
}

export function welcome(opts: { section: string, desc: string }): { history: Array<Message>, readLine: readline.Interface } {
  const { section, desc } = opts
  console.info(pc.cyan('╔════════════════════════════════════╗'))
  console.info(pc.cyan(`║  ${section}${' '.repeat(38 - 4 - section.length)}║`))
  console.info(pc.cyan(`║  "${desc}"${' '.repeat(38 - 6 - desc.length)}║`))
  console.info(pc.cyan('╚════════════════════════════════════╝'))
  console.info()

  checkAPIKey()

  const history: Message[] = []
  const readLine = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return { history, readLine }
}

export function exit(trimmed: string, readLine: readline.Interface): void {
  if (!['q', 'exit', ''].includes(trimmed))
    return
  readLine.close()
  console.log('GoodBye!')
}

/**
 * 初始化 prompt
 */
export function initPrompt(opts: { query: string, readLine: readline.Interface, history: Message[] }): void {
  const { query, readLine, history } = opts
  const trimmed = query.trim().toLocaleLowerCase()
  exit(trimmed, readLine)
  history.push({ role: 'user', content: query })
}

export async function resolvePrompt(opts: {
  history: Array<Message>
  fileName?: string
  readLine: readline.Interface
  prompt: (opts: PromptOpts) => Promise<void>
}): Promise<void> {
  const { history, fileName, readLine, prompt } = opts
  console.log()
  console.log(JSON.stringify(history))
  if (fileName)
    await writeJSONFile({ path: `./.tmp/${fileName}.json`, content: history })
  await prompt({ history, readLine })
}
