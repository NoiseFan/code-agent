import type { PromptOpts } from '../types'
import { initPrompt, welcome } from '../core'

async function prompt(opts: PromptOpts) {
  const { history, readLine } = opts

  while (true) {
    const query = await initPrompt({ prefix: '10', readLine, history })
  }
}

prompt(welcome({ section: 's10 - system prompt' }))
