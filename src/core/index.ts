import type { Anthropic } from '@anthropic-ai/sdk'
import type { MemoryManger } from '../persistence/memory'
import type { Message, PromptOpts, ToolDefinition } from '../types'
import process from 'node:process'
import readline from 'node:readline'
import pc from 'picocolors'
import { writeJSONFile } from '../utils/write'
import { WORKDIR } from './runtime'

/**
 * 转换成 Anthropic 格式的 Tool
 */
export function convertTools(tools: ToolDefinition[] | undefined): Anthropic.Messages.Tool[] {
  if (!tools || !tools.length)
    return []
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
  }))
}

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

export function welcome(opts: {
  section: string
  desc?: string
}): {
  history: Array<Message>
  readLine: readline.Interface
} {
  const { section, desc } = opts
  console.info(pc.cyan('╔════════════════════════════════════╗'))
  console.info(pc.cyan(`║  ${section}${' '.repeat(38 - 4 - section.length)}║`))
  if (desc)
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
 * prompt 输入框
 */
async function inputPrompt(readLine: readline.Interface, prefix: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    readLine.question(pc.cyan(`${prefix}>>`), async (query: string) => {
      if (query)
        resolve(query)
      else
        reject(new Error('EOF'))
    })
  })
}

function outputHelp() {
  console.log('Commands:')
  console.log('  /hooks  - Show current hook configuration')
  console.log('  /help   - Show this help message')
  console.log('  q/exit  - Exit the session')
}

function outputMemory(memoryManager: MemoryManger) {
  if (memoryManager.memories.size) {
    console.log(pc.yellow('Current memories:'))
    for (const [name, mem] of memoryManager.memories) {
      console.log(`  [${mem.type}] ${name}: ${mem.description}`)
    }
  }
  else {
    console.log('  (no memories)')
  }
}

function outputCommand(query: string, opt?: MemoryManger) {
  switch (query) {
    case '/help':
      outputHelp()
      break
    case '/memory':
      if (opt)
        outputMemory(opt)
      break
  }
}
/**
 * 初始化 prompt
 */
export async function initPrompt(opts: {
  prefix?: string
  query?: string
  readLine: readline.Interface
  history: Message[]
  option?: MemoryManger
}): Promise<string> {
  const { prefix, readLine, history, option } = opts
  let query = opts.query ?? ''
  if (prefix)
    query = await inputPrompt(readLine, prefix)
  const trimmed = query.trim().toLocaleLowerCase()
  exit(trimmed, readLine)

  outputCommand(query, option)
  if (!query.startsWith('/'))
    history.push({ role: 'user', content: query })
  return query
}

export async function resolvePrompt(opts: {
  history: Array<Message>
  fileName?: string
  readLine: readline.Interface
  prompt: (opts: PromptOpts) => Promise<void>
}): Promise<void> {
  const { history, fileName, readLine, prompt } = opts
  if (history.length) {
    console.log()
    console.log(JSON.stringify(history))

    if (fileName)
      await writeJSONFile({ path: `./.tmp/${fileName}.json`, content: history })
  }

  await prompt({ history, readLine })
}
