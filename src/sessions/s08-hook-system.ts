import type { PromptOpts } from '../types'
import { initPrompt, resolvePrompt, welcome } from '../core'
import { agentLoopWithHooks } from '../core/agent-loop/hooks'
import { WORKDIR } from '../core/runtime'
import { HookManager, HooksEventEnum } from '../persistence/hooks'
import { extractTextReply } from '../utils/agent-loop'

const system = `You are a coding agent at ${WORKDIR}. Use tools to solve tasks.
Hook may modify or block you tool calls.
Some tool results may inclaude additional context from hooks.

Hook exit codes:
- 0: Continue normally
- 1: Block the tool call
- 2: Inject a message

Use /hooks to see configured hooks.
`
async function prompt(opts: PromptOpts) {
  const { history, readLine } = opts
  const hooks = new HookManager()
  while (true) {
    /* ==================== Session Hook ==================== */
    // 会话开始时执行一次（比如打印欢迎信息）
    hooks.runHooks('SessionStart', { tool_name: '', tool_input: {} })
    const query = await initPrompt({ prefix: '08', readLine, history })

    if (query.trim() === '/hooks') {
      let hooksCount = 0
      console.log('Current hooks:')
      for (const event of HooksEventEnum) {
        hooksCount += hooks.hooks[event].length
        console.log(`  ${event} ${hooks.hooks[event].length} hooks`)
      }

      if (!hooksCount)
        continue

      console.log('Deatils:')
      for (const event of HooksEventEnum) {
        for (const hook of hooks.hooks[event]) {
          if (hook) {
            console.log(
              `  [${event}] matcher=${hook.matcher || '*'} command="${hook.command.slice(0, 50)}"`,
            )
          }
        }
      }
      continue
    }
    try {
      await agentLoopWithHooks(history, { system, hooks })
      extractTextReply(history)
    }
    catch (e) {
      console.error(e)
    }
    resolvePrompt({ history, fileName: '08-hook-system', readLine, prompt })
  }
}

prompt(welcome({ section: 's08 - hook system' }))
