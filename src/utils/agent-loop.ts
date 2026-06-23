import type Anthropic from '@anthropic-ai/sdk'
import type { ContentBlock, Message, ToolHandler, ToolInput, ToolResultBlock } from '../types'
import pc from 'picocolors'

export function extractTextReply(message: Message[]): void {
  const lastContent = message.at(-1)?.content
  let output = ''
  if (Array.isArray(lastContent)) {
    for (const block of lastContent) {
      if (block.type === 'text')
        output += block.text
    }
  }
  console.log(output)
}

export function transformAssistant(block: ContentBlock): ContentBlock {
  // todo 没搞懂，这里为什么做这一层的转换
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text }
    case 'tool_use':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input }
    default:
      // 将 thinking block 等，转换为 text
      return { type: 'text', text: JSON.stringify(block) }
  }
}

export async function execTools(
  response: Anthropic.Message,
  context: {
    handlers: Record<string, ToolHandler>
    finalCallBack?: (toolBlock: ContentBlock) => void
  },
): Promise<Array<ContentBlock>> {
  const results: ToolResultBlock[] = []
  for (const block of response.content) {
    // 1. 排除边界条件
    if (block.type !== 'tool_use')
      continue

    const { handlers, finalCallBack } = context

    // 2. 解析到具体的 执行函数 >> runBash
    const handler = handlers[block.name]
    if (!handler) {
      console.log(pc.red(`Unknow tools:${block.name}`))
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: `Error: Unknown tool "${block.name}"`,
      })
      continue
    }
    // 打印工具调用
    console.log(pc.yellow(block.name))

    // 3. 执行工具
    const output = await handler(block.input as ToolInput)
    console.log(output.slice(0, 200))

    // 4. 拼接输出结果
    results.push({
      type: 'tool_result',
      tool_use_id: block.id,
      content: output.slice(0, 50_000), // 限制输出长度
    })

    // 执行结束回调
    finalCallBack?.(block)
  }
  return results
}
