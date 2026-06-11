import type { Message } from '../types'
import pc from 'picocolors'
import { runWrite } from '../core/tools'

export async function writeJSONFile(options: { path: string, content: Array<Message> }): Promise<void> {
  const { path } = options
  const content = JSON.stringify(options.content)
  await runWrite({ path, content })
  console.log(pc.yellow(`Wrote ${content.length} bytes to ${path}`))
}
