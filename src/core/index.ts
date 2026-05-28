import type readline from 'node:readline'
import process from 'node:process'
import pc from 'picocolors'
import { WORKDIR } from '../core/agent-loop'

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
export function welcome(opts: { section: string, desc: string }): void {
  const { section, desc } = opts
  console.info(pc.cyan('╔════════════════════════════════════╗'))
  console.info(pc.cyan(`║  ${section}${' '.repeat(38 - 4 - section.length)}║`))
  console.info(pc.cyan(`║  "${desc}"${' '.repeat(38 - 6 - desc.length)}║`))
  console.info(pc.cyan('╚════════════════════════════════════╝'))
  console.info()

  checkAPIKey()
}

export function exit(trimmed: string, readLine: readline.Interface): void {
  if (['q', 'exit', ''].includes(trimmed)) {
    readLine.close()
    console.log('GoodBye!')
  }
}
