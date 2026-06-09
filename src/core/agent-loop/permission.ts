import type { Anthropic } from '@anthropic-ai/sdk'
import type readline from 'node:readline'
import type { PermissionManager } from '../../persistence/permission'
import type { AgentLoopOptions, Message, ToolHandler, ToolInput, ToolResultBlock } from '../../types'
import { convertTools } from '..'
import { transformAssistant } from '../../utils/agent-loop'
import { client, MODEL } from '../runtime'
import { BASE_HANDLERS } from '../tools'

export async function agentLoopWithPermission(messages: Message[], options: AgentLoopOptions): Promise<void> {
  const { system, tools, perms, readline } = options
  const anthropicTools = convertTools(tools)
  if (!readline)
    return

  while (true) {
    // 1. 调用 LLM
    const response = await client.messages.create({
      model: MODEL,
      system,
      messages,
      tools: anthropicTools,
      max_tokens: 8_000,
    })

    // 2. 记录 assistant 回复
    const assistantContent = transformAssistant(response.content)
    messages.push({ role: 'assistant', content: assistantContent })

    // 3. 如果模型决定停止，退出循环
    if (response.stop_reason !== 'tool_use')
      return

    // 4. 调用工具
    const toolContext = { output: '', perms, readLine: readline }
    const results = await execTool(response, toolContext)

    // 将结果追加回消息
    messages.push({ role: 'user', content: results })
  }
}

async function execTool(
  response: Anthropic.Message,
  context: {
    readLine: readline.Interface
    perms: PermissionManager | undefined
    output: string
  },
): Promise<Array<ToolResultBlock>> {
  const { perms, readLine } = context
  const results: ToolResultBlock[] = []
  if (!perms)
    return results

  for (const block of response.content) {
    // 1. 排除边界条件
    if (block.type !== 'tool_use')
      continue

    const { name: toolName, input: toolInput } = block

    // 2. 权限检查
    const decision = perms.check(toolName, toolInput as ToolInput)
    const handler = BASE_HANDLERS[toolName]

    // 3. 处理权限
    if (handler) {
      if (decision.behavior === 'deny') {
        context.output = `Permission denied: ${decision.reason}`
        console.log(`  [DENIED] ${toolName}: ${decision.reason}`)
      }
      else if (decision.behavior === 'allow') {
        context.output = await handler(toolInput as ToolInput)
        console.log(`> ${toolName}: ${context.output.slice(0, 200)}`)
      }
      else if (decision.behavior === 'ask') {
        await execToolByAsk({
          ...context,
          readLine,
          perms,
          handler,
          output: context.output,
          toolInput: toolInput as ToolInput,
          toolName,
        })
      }
      else {
        console.error('Unknow behavior')
      }
    }
    else {
      context.output = `Unknow tool: ${toolName}`
    }

    results.push({
      type: 'tool_result',
      tool_use_id: block.id,
      content: context.output,
    })
  }

  return results
}

interface ExecToolByAskOptions {
  readLine: readline.Interface
  perms: PermissionManager
  handler: ToolHandler
  output: string
  toolName: string
  toolInput: ToolInput
}

async function execToolByAsk(opts: ExecToolByAskOptions) {
  const { readLine, perms, toolName, toolInput, handler } = opts

  // 需要用户确认
  console.log(`\n  [Permission] ${toolName}: ${JSON.stringify(toolInput).slice(0, 200)}`)

  const answerInput = await new Promise<string>((resolve) => {
    readLine.question('  Allow? (y/n/always): ', resolve)
  })
  const answer = answerInput.toLowerCase() as 'y' | 'yes' | 'n' | 'no' | 'always' | 'a'

  if (['y', 'yes', 'a', 'always'].includes(answer)) {
    if (['a', 'always'].includes(answer)) {
      perms.rules.push({ tool: toolName, path: '*', behavior: 'allow' })
      perms.consecutiveDenials = 0
    }
    opts.output = await handler(toolInput)
    console.log(`> ${toolName}: ${opts.output.slice(0, 200)}`)
  }
  else {
    opts.output = `Permission denied by user for ${toolName}`
    perms.consecutiveDenials++
    console.log(` [USER DENIED] ${toolName}`)
    if (perms.consecutiveDenials >= perms.maxConsecutiveDenials) {
      console.log(
        `  [${perms.consecutiveDenials} consecutive denials -- consider switching to plan mode]`,
      )
    }
  }
}
