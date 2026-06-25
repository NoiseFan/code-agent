import type { Anthropic } from '@anthropic-ai/sdk'
import type { HookManager } from '../persistence/hooks'
import type { MemoryManger } from '../persistence/memory'
import type { SystemPromptBuilder } from '../persistence/prompt'
import type { Message, PromptOpts, ToolDefinition } from '../types'
import process from 'node:process'
import readline from 'node:readline'
import { before } from 'node:test'
import pc from 'picocolors'
import { accurateCalculation, autoCompact, CONTEXT_LIMIT } from '../persistence/compact'
import { esimateTokens } from '../persistence/prompt'
import { CONTINUATION_MESSAGE, MAX_RECOVERY_ATTEMPTS } from '../persistence/recovery'
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

export function exit(trimmed: string, readLine: readline.Interface): boolean {
  if (!['q', 'exit', ''].includes(trimmed))
    return false
  readLine.close()
  console.log('GoodBye!')
  return true
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

function outputHelp(opts?: outputCommandOptions) {
  console.log('Commands:')
  if (opts) {
    const { hook, memory, systemPrompt } = opts
    if (hook)
      console.log('  /hooks  - Show current hook configuration')
    if (systemPrompt) {
      console.log('  /prompt  - Show full system prompt')
      console.log('  /section - Show section headers')
      console.log('  /budget  - Show token estimate')
    }
    if (memory)
      console.log('  /memory  - Show current memories')
  }
  console.log('  /help   - Show this help message')
  console.log('  q/exit  - Exit the session')
}

function outputMemory(opts?: MemoryManger) {
  if (!opts)
    return
  if (opts.memories.size) {
    console.log(pc.yellow('Current memories:'))
    for (const [name, mem] of opts.memories) {
      console.log(`  [${mem.type}] ${name}: ${mem.description}`)
    }
  }
  else {
    console.log('  (no memories)')
  }
}

/**
 * 输入 token 预估使用量
 */
function outputTokens(opts?: SystemPromptBuilder) {
  if (!opts)
    return

  const prompt = opts.build()
  console.log(`Total: ~${esimateTokens(prompt)} tokens (${prompt.length} chars)`)
}

function outputPrompt(opts?: SystemPromptBuilder) {
  if (!opts)
    return
  console.log('--- System Prompt ---')
  console.log(opts.build())
  console.log('--- End')
}

function outputStatus(histroy?: Array<Message>) {
  if (!histroy || !histroy.length)
    return
  const estimatedTokens = accurateCalculation(histroy)
  console.log('Recovery config:')
  console.log(`  Max retries: ${MAX_RECOVERY_ATTEMPTS}`)
  console.log(`  Token threshold: ${CONTEXT_LIMIT}`)
  console.log(`  Continuation message: "${CONTINUATION_MESSAGE.slice(0, 60)}..."`)
  console.log(`Current context: ${histroy.length} messages, ${estimatedTokens} tokens.`)
}

async function outputCompact(histroy?: Array<Message>) {
  if (!histroy || !histroy.length) {
    console.log(`  (no messsage to compact)`)
    return
  }

  const beforeTokens = accurateCalculation(histroy)
  console.log(`[Compacting ${histroy.length} messages (~${beforeTokens} tokens)...]`)
  await autoCompact(histroy)
  const afterTokens = accurateCalculation(histroy)
  console.log(`[Compacted to ${afterTokens} tokens]`)
}

type outputCommandOptions = Partial<{
  hook: HookManager
  memory: MemoryManger
  systemPrompt: SystemPromptBuilder
}>

function outputCommand(query: string, opt?: outputCommandOptions & { history?: Array<Message> }): boolean {
  switch (query) {
    case '/help':
      outputHelp(opt)
      break
    case '/memory':
      outputMemory(opt?.memory)
      break
    case '/prompt':
      outputPrompt(opt?.systemPrompt)
      break
    case '/budget':
      outputTokens(opt?.systemPrompt)
      break
    case '/status':
      outputStatus(opt?.history)
      break
    case '/compact':
      outputCompact(opt?.history)
  }

  return query.startsWith('/')
}

type PromptResultType = { type: 'message', message: Array<Message> } | { type: 'command', command: string } | { type: 'exit' }
/**
 * 初始化 prompt
 */
export async function initPrompt(opts: {
  prefix?: string
  query?: string
  readLine: readline.Interface
  history: Message[]
  option?: outputCommandOptions
}): Promise<PromptResultType> {
  const { prefix, readLine, history, option } = opts
  let query = opts.query ?? ''
  if (prefix)
    query = await inputPrompt(readLine, prefix)
  const trimmed = query.trim().toLocaleLowerCase()

  if (exit(trimmed, readLine))
    return { type: 'exit' }

  if (outputCommand(query, { history, ...option }))
    return { type: 'command', command: query }

  if (!query.startsWith('/'))
    history.push({ role: 'user', content: query })
  return { type: 'message', message: history }
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
