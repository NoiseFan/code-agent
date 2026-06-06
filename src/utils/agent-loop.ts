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

export async function execTool(
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

/* ==================== 主循环（带压缩） ==================== */
