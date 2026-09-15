import type { PromptOpts, ToolHandler } from '../types'
import { initPrompt, resolvePrompt, welcome } from '../core'
import { ASK_USER_QUESTION_GUIDANCE, AskUserQuestion } from '../core/agent-loop/ask-user-question'
import { agentLoopWithSystemPrompt } from '../core/agent-loop/system'
import { WORKDIR } from '../core/runtime'
import { BASE_HANDLERS, BASE_TOOLS } from '../core/tools'
import { SystemPromptBuilder } from '../persistence/prompt'
import { extractTextReply } from '../utils/agent-loop'

const system = [
  `You are a coding agent at ${WORKDIR}. Use tools to solve tasks.`,
  ASK_USER_QUESTION_GUIDANCE.join('\n'),
].join('\n\n')

async function prompt(opts: PromptOpts): Promise<void> {
  const { history, readLine } = opts
  const askUserQuestion = new AskUserQuestion(readLine)
  const tools = [...BASE_TOOLS, askUserQuestion.tool]
  const systemPrompt = new SystemPromptBuilder({ tools, baseSystem: system })
  const handlers: Record<string, ToolHandler> = {
    ...BASE_HANDLERS,
    ask_user_question: askUserQuestion.createHandler(),
  }

  while (true) {
    const initResult = await initPrompt({ prefix: '13', readLine, history, option: { systemPrompt } })
    if (initResult.type === 'command')
      continue
    if (initResult.type === 'exit')
      break

    await agentLoopWithSystemPrompt(history, {
      handlers,
      systemBuilder: systemPrompt,
      tools,
    })
    extractTextReply(history)
    await resolvePrompt({ history, fileName: 's13-ask-user-question', readLine, prompt })
  }
}

prompt(welcome({ section: 's21 - ask user question' })).catch(console.error)
