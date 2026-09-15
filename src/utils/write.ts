import type { Message } from '../types'
import pc from 'picocolors'
import { runWrite } from '../core/tools'
import { serialize } from './index'

export async function writeJSONFile(options: { path: string, content: Array<Message> }): Promise<void> {
  const { path } = options
  const content = serialize(options.content)
  await runWrite({ path, content })
  console.log(pc.yellow(`Wrote ${content.length} bytes to ${path}`))
}
