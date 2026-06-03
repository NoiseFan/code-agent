import process from 'node:process'
import readline from 'node:readline'

import { select } from '@clack/prompts'
import pc from 'picocolors'
import { PermissionManager, PermissionModels } from '../persistence/permission'

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
