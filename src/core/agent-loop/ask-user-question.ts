import type readline from 'node:readline'
import type { ToolDefinition, ToolHandler, ToolInput } from '../../types'
import pc from 'picocolors'

export interface QuestionOption {
  label: string
  description: string
}

export interface UserQuestion {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect: boolean
}

export interface QuestionAnswer {
  question: string
  selected: string[]
}

export interface AskUserQuestionResult {
  status: 'answered' | 'cancelled'
  answers: QuestionAnswer[]
}

/**
 * 当任务需要用户在明确选项中作出选择，或澄清含糊的需求时，使用 ask_user_question。
 *
 * - 每次提出 1～4 个简短且聚焦的问题。
 * - 为每个问题提供 2～4 个不同的选项。
 * - 互斥选项将 multiSelect 设为 false，可多选时设为 true。
 * - 将推荐选项放在首位，并在其标签末尾添加“（推荐）”。
 * - 不要添加“其他”选项，也不要生成数字快捷键；界面会自动添加两者。
 */
export const ASK_USER_QUESTION_GUIDANCE: Array<string> = [
  'Use ask_user_question when progress requires the user to choose between concrete options or clarify an ambiguous requirement.',
  '- Ask 1-4 short, focused questions at a time.',
  '- Provide 2-4 distinct options for each question.',
  '- Set multiSelect to false for mutually exclusive choices and true when multiple choices may apply.',
  '- Put the recommended option first and suffix its label with "(Recommended)".',
  '- Do not add an "Other" option and do not generate numeric shortcuts; the terminal UI adds both.',
]

export const ASK_USER_QUESTION_TOOL: ToolDefinition = {
  name: 'ask_user_question',
  description: 'Ask the user one or more structured multiple-choice questions and wait for their answers.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description: 'Questions to ask the user. Ask between 1 and 4 questions.',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'A clear and specific question.',
            },
            header: {
              type: 'string',
              description: 'A short topic label for the question.',
            },
            options: {
              type: 'array',
              description: 'Two to four choices. Do not include an Other option.',
              minItems: 2,
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  label: {
                    type: 'string',
                    description: 'Concise display label for this choice.',
                  },
                  description: {
                    type: 'string',
                    description: 'Explain the effect or trade-off of choosing this option.',
                  },
                },
                required: ['label', 'description'],
              },
            },
            multiSelect: {
              type: 'boolean',
              description: 'Whether the user may select more than one choice.',
            },
          },
          required: ['question', 'header', 'options', 'multiSelect'],
        },
      },
    },
    required: ['questions'],
  },
}

/**
 * 封装 ask_user_question 工具的协议、输入校验、终端交互和结果序列化。
 */
export class AskUserQuestion {
  readonly tool: ToolDefinition = ASK_USER_QUESTION_TOOL
  private readLine: readline.Interface

  constructor(readLine: readline.Interface) {
    this.readLine = readLine
  }

  /**
   * 创建可直接注册到 agent loop 的工具 handler。
   */
  createHandler(): ToolHandler {
    return input => this.ask(input)
  }

  /**
   * 校验模型参数、依次提问，并返回适合放入 tool_result 的 JSON。
   */
  async ask(input: ToolInput): Promise<string> {
    const questions = this.parseQuestions(input)
    if (typeof questions === 'string')
      return `Error: Invalid ask_user_question input: ${questions}`

    const answers: QuestionAnswer[] = []
    for (const [index, question] of questions.entries()) {
      const selected = await this.askQuestion(question, index, questions.length)
      if (selected === null)
        return this.serialize({ status: 'cancelled', answers })

      answers.push({ question: question.question, selected })
    }

    return this.serialize({ status: 'answered', answers })
  }

  private parseQuestions(input: ToolInput): UserQuestion[] | string {
    if (!Array.isArray(input.questions))
      return 'questions must be an array'
    if (input.questions.length < 1 || input.questions.length > 4)
      return 'questions must contain 1-4 items'

    const questions: UserQuestion[] = []
    const seenQuestions = new Set<string>()

    for (const [questionIndex, rawQuestion] of input.questions.entries()) {
      if (!this.isRecord(rawQuestion))
        return `questions[${questionIndex}] must be an object`

      const { question, header, options, multiSelect } = rawQuestion
      if (typeof question !== 'string' || !question.trim())
        return `questions[${questionIndex}].question must be a non-empty string`
      if (typeof header !== 'string' || !header.trim())
        return `questions[${questionIndex}].header must be a non-empty string`
      if (typeof multiSelect !== 'boolean')
        return `questions[${questionIndex}].multiSelect must be a boolean`
      if (!Array.isArray(options) || options.length < 2 || options.length > 4)
        return `questions[${questionIndex}].options must contain 2-4 items`
      if (seenQuestions.has(question))
        return `question text must be unique: ${question}`

      const parsedOptions: QuestionOption[] = []
      const seenLabels = new Set<string>()
      for (const [optionIndex, rawOption] of options.entries()) {
        if (!this.isRecord(rawOption))
          return `questions[${questionIndex}].options[${optionIndex}] must be an object`
        if (typeof rawOption.label !== 'string' || !rawOption.label.trim())
          return `questions[${questionIndex}].options[${optionIndex}].label must be a non-empty string`
        if (typeof rawOption.description !== 'string')
          return `questions[${questionIndex}].options[${optionIndex}].description must be a string`
        if (rawOption.label.toLowerCase() === 'other')
          return `questions[${questionIndex}] must not include an Other option`
        if (seenLabels.has(rawOption.label))
          return `option labels must be unique within a question: ${rawOption.label}`

        seenLabels.add(rawOption.label)
        parsedOptions.push({
          label: rawOption.label,
          description: rawOption.description,
        })
      }

      seenQuestions.add(question)
      questions.push({ question, header, options: parsedOptions, multiSelect })
    }

    return questions
  }

  private async askQuestion(question: UserQuestion, index: number, total: number): Promise<string[] | null> {
    console.log()
    console.log(pc.cyan(`[${index + 1}/${total}] ${question.header}`))
    console.log(question.question)

    for (const [optionIndex, option] of question.options.entries()) {
      console.log(`  ${pc.yellow(`${optionIndex + 1}.`)} ${option.label}`)
      if (option.description)
        console.log(pc.dim(`     ${option.description}`))
    }

    const otherIndex = question.options.length + 1
    console.log(`  ${pc.yellow(`${otherIndex}.`)} Other`)

    while (true) {
      const hint = question.multiSelect
        ? `Choose one or more options (for example 1,3), or q to cancel: `
        : `Choose 1-${otherIndex}, or q to cancel: `
      const answer = (await this.askLine(pc.cyan(hint))).trim()

      if (answer.toLowerCase() === 'q')
        return null

      const indexes = this.parseSelection(answer, otherIndex, question.multiSelect)
      if (!indexes) {
        console.log(pc.red('Invalid selection. Please enter one of the displayed numbers.'))
        continue
      }

      const selected = indexes
        .filter(selectedIndex => selectedIndex !== otherIndex)
        .map(selectedIndex => question.options[selectedIndex - 1]!.label)

      if (indexes.includes(otherIndex)) {
        const customAnswer = (await this.askLine(pc.cyan('Other: '))).trim()
        if (!customAnswer) {
          console.log(pc.red('Other cannot be empty. Please choose again.'))
          continue
        }
        selected.push(customAnswer)
      }

      return selected
    }
  }

  private parseSelection(value: string, max: number, multiSelect: boolean): number[] | null {
    if (!value)
      return null

    const parts = multiSelect ? value.split(/[\s,]+/) : [value]
    if (parts.some(part => !/^\d+$/.test(part)))
      return null

    const indexes = [...new Set(parts.map(Number))]
    if (!multiSelect && indexes.length !== 1)
      return null
    if (indexes.some(index => index < 1 || index > max))
      return null
    return indexes
  }

  private askLine(message: string): Promise<string> {
    return new Promise(resolve => this.readLine.question(message, resolve))
  }

  private serialize(result: AskUserQuestionResult): string {
    return JSON.stringify(result, null, 2)
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}
