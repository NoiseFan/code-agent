import type { PlanningState, TodoItem, ToolDefinition, ToolHandler } from '../types'

export enum TODOEnum {
  pending,
  in_progress,
  completed,
}
// TODO 最大条数（防止过长）
const MAX_PLAN_ITEMS = 12

const marker: Record<TODOEnum, string> = {
  [TODOEnum.pending]: '[ ]',
  [TODOEnum.in_progress]: '[>]',
  [TODOEnum.completed]: '[x]',
}

export class TodoManger {
  private state: PlanningState = {
    items: [],
    roundSinceUpdate: 0,
  }

  update(items: Array<TodoItem>): string {
    if (items.length > MAX_PLAN_ITEMS)
      throw new Error(`Keep the session plan short (max ${MAX_PLAN_ITEMS} items)`)

    const normalized: TodoItem[] = []
    let inProgressCount = 0

    for (const [index, rawItem] of items.entries()) {
      const { content = '', status = 'pending', activeForm = '' } = rawItem

      if (!content)
        throw new Error(`Item ${index}`)

      if (!Object.values(TODOEnum).includes(status))
        throw new Error(`Item ${index}: invalid status '${status}'`)
      if (status === TODOEnum.in_progress)
        inProgressCount++

      normalized.push({
        id: (index + 1).toString(),
        content,
        status,
        activeForm,
      })

      if (inProgressCount > 1)
        throw new Error(`Only one plan item can be in_progress`)
    }

    this.state.items = normalized
    this.state.roundSinceUpdate = 0
    return this.reader()
  }

  /**
   * 记录一轮没有更新计划
   */
  noteRoundWithoutUpdate(): void {
    this.state.roundSinceUpdate++
  }

  reader(): string {
    if (this.state.items.length === 0)
      return 'No session plan yet'

    const lines: string[] = []
    for (const item of this.state.items) {
      let line = `${marker[item.status]} ${item.content}`
      if (item.status === TODOEnum.in_progress && item.activeForm) {
        line += ` (${item.activeForm})`
      }
      lines.push(line)
    }

    // 进度统计
    const completed = this.state.items.filter(i => i.status === TODOEnum.completed).length
    lines.push(`\n(${completed}/${this.state.items.length} completed)`)

    return lines.join('\n')
  }
}

export const TODO_TOOL_DEFINTION: ToolDefinition = {
  name: 'todo',
  description: 'Rewrite th current session plan for multi-step work.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'What this step does' },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
              description: 'Current status of this setp',
            },
            activeFrom: {
              type: 'string',
              description: 'Optionall present-continuous label (e.g. "Reading the file")',
            },
          },
          required: ['content', 'status'],
        },
      },
    },
    required: ['items'],
  },
}

export function createTodoHandler(manager: TodoManger): ToolHandler {
  return (input) => {
    try {
      const items = input.items as TodoItem[]
      return manager.update(items)
    }
    catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Unknow error'}`
    }
  }
}
