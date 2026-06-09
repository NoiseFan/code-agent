import type { PromptOpts } from '../types'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { cancel, confirm, intro, isCancel, outro } from '@clack/prompts'
import { cac } from 'cac'
import { initPrompt, resolvePrompt, welcome } from '../core'
import { agentLoopWithHooks } from '../core/agent-loop/hooks'
import { WORKDIR } from '../core/runtime'
import { BASE_TOOLS } from '../core/tools'
import { HookManager, HooksEventEnum, TRUST_MARKER } from '../persistence/hooks'
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
  const { history, hooks, readLine } = opts

  while (true) {
    const query = await initPrompt({ prefix: '08', readLine, history })

    // 提示 hook 详情信息
    if (hooks) {
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
    }
    try {
      await agentLoopWithHooks(history, { system, tools: BASE_TOOLS, hooks })
      extractTextReply(history)
    }
    catch (e) {
      console.error(e)
    }
    await resolvePrompt({ history, fileName: '08-hook-system', readLine, prompt })
  }
}

/**
 * 创建确认 workspace 权限
 */
async function ensureWorkspaceTrusted(): Promise<boolean> {
  if (existsSync(TRUST_MARKER))
    return true

  intro('Hook trust check')
  const trusted = await confirm({
    message: `Trust project at ${WORKDIR}? Hooks may execute shell commands in this workspace.`,
  })

  if (isCancel(trusted)) {
    cancel('Trust confirmation cancelled.')
    return false
  }

  if (!trusted) {
    outro('Workspace not trusted. Continuing without enabling hooks.')
    return true
  }

  mkdirSync(path.dirname(TRUST_MARKER), { recursive: true })
  writeFileSync(TRUST_MARKER, '', 'utf-8')
  outro(`Trusted workspace: ${TRUST_MARKER}`)
  return true
}

const cli = cac('s08-hook-system')

cli
  .command('[session]', 'Run the hook system session')
  .action(async () => {
    const trusted = await ensureWorkspaceTrusted()
    if (!trusted) {
      process.exitCode = 1
      return
    }

    // 主入口
    const hooks = new HookManager()
    // session hook
    // 会话开始时执行一次（比如打印欢迎信息）
    hooks.runHooks('SessionStart', { tool_name: '', tool_input: {} })
    await prompt({ ...welcome({ section: 's08 - hook system' }), hooks })
  })

cli.parse()
