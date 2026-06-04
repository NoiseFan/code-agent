import process from 'node:process'
import readline from 'node:readline'

import { select } from '@clack/prompts'
import pc from 'picocolors'
import { WORKDIR } from '../core/runtime'
import { PermissionManager, PermissionModels } from '../persistence/permission'

const SYSTEM = `You are a coding agent at ${WORKDIR}. Use tools to solve tasks.
The user controls permissions. Some tool calls may be denied.

Available permission modes:
- default: Ask user fo unmatched operations
- plan: Read-only mode, no writes allowed
- auto: Auto-approve safe reads, ask for writes

Use /mode to swtich modes. Use /rules to see current rules.
`

async function main() {
  const readLine = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  // 选择权限模式
  const modeInput = await select({
    message: 'Permission modes:',
    options: PermissionModels.map((item) => { return { label: item, value: item } }),
    initialValue: 'default',
  })

  const pers = new PermissionManager(modeInput)
  console.log(pc.cyan(`[Permission mode: ${pers.mode}]`))
  console.log()
}

main().catch(console.error)
