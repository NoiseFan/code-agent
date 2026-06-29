import type { ToolDefinition, ToolHandler } from '../types'
import type { createTaskOptionsType, Task } from '../types/task'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORKDIR } from '../core/runtime'

export const TASK_PROMPT: Array<string> = [
  'This agent has a task system for planning and tracking mutil-step work.',
  'Key workflow: create task with blockedBy dependencies → claim (checks deps) → complete (reports unblocked) ',
  'When starting a new session, always list_tasks first to discover existing task  and their IDs',
  'Task IDs are auto-generated in formart "task_{timestamp}_{randow}" (e.g. task_1782761547_80042)',
  'Always use the exact ID returned by create_task or list_tasks - never make up IDs',
]

const TASK_DIR = join(WORKDIR, '.task')

export class TaskManager {
  private dir: string

  constructor(taskDir: string = TASK_DIR) {
    this.dir = taskDir
  }

  /**
   * 确保 .task 目录存在
   */
  private ensureDir(): void {
    mkdirSync(this.dir, { recursive: true })
  }

  getDir(): string {
    return this.dir
  }

  /**
   * 获取任务文件路径
   */
  private taskPath(taskId: string): string {
    return join(this.dir, `${taskId}.json`)
  }

  /**
   * 从文件中加载任务
   */
  load(taskId: string): Task {
    return JSON.parse(readFileSync(this.taskPath(taskId), 'utf-8')) as Task
  }

  /**
   * 保存任务到文件
   */
  save(task: Task): void {
    this.ensureDir()
    writeFileSync(this.taskPath(task.id), JSON.stringify(task, null, 2), 'utf-8')
  }

  create(opts: createTaskOptionsType): Task {
    const { subject, description = '', blockedBy } = opts
    for (const depId of blockedBy) {
      try {
        this.load(depId)
      }
      catch {
        throw new Error(`Dependency task ${depId} not found. Use list tasks to see existing task IDs.`)
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const task: Task = {
      id: generateTaskId(),
      subject,
      description,
      status: 'pending',
      owner: null,
      blockedBy,
      createAt: now,
      updateAt: now,
    }
    this.save(task)
    return task
  }

  /**
   * 获取单个任务
   */
  get(taskId: string): Task {
    return this.load(taskId)
  }

  /**
   * 列出所有任务
   */
  listAll(): Array<Task> {
    this.ensureDir()
    const files = readdirSync(this.dir)
    const taskFiles = files.filter(f => f.endsWith('.json')).sort()

    const tasks: Array<Task> = []
    for (const file of taskFiles) {
      try {
        const content = readFileSync(join(this.dir, file), 'utf-8')
        tasks.push(JSON.parse(content) as Task)
      }
      catch {}
    }
    return tasks
  }

  /**
   * 检查任务是否可以开始
   * 所有 blockBy 依赖都已经处理完成
   */
  private canStart(taskId: string): boolean {
    const task = this.load(taskId)

    for (const depId of task.blockedBy) {
      try {
        const dep = this.load(depId)
        if (dep.status !== 'completed')
          return false
      }
      catch {
        // 依赖任务不存在
        return false
      }
    }
    return true
  }

  /**
   * 领取任务
   * pending -> in_progress
   */
  claimTask(opts: { taskId: string, owner?: string }): string {
    const { taskId, owner = 'agent' } = opts
    const task = this.load(taskId)

    // 1. 状态检查
    if (task.status !== 'pending')
      return `Task ${taskId} is ${task.status}, cannot claim.`

    // 2. 依赖检查
    if (!this.canStart(taskId)) {
      const blockedDeps: Array<string> = []
      for (const depId of task.blockedBy) {
        try {
          const dep = this.load(depId)
          if (dep.status !== 'completed')
            blockedDeps.push(depId)
        }
        catch {
          blockedDeps.push(depId)
        }
      }
    }

    // 领取任务
    task.owner = owner
    task.status = 'in_progress'
    task.updateAt = Math.floor(Date.now() / 1_000)
    this.save(task)

    return `Claimed ${taskId} (${task.subject})`
  }

  completeTask(taskId: string): string {
    const task = this.load(taskId)

    // 1. 状态检查
    if (task.status !== 'in_progress')
      return `Task ${taskId} is ${task.status}, cannot complate.`

    // 2. 标记完成
    task.status = 'completed'
    task.updateAt = Math.floor(Date.now() / 1_000)
    this.save(task)

    // 3. 扫描所有 pending 任务，找出刚被解锁的
    const allTasks = this.listAll()
    const unblocked: Array<string> = []
    for (const t of allTasks) {
      if (t.status === 'pending' && t.blockedBy.length > 0 && this.canStart(t.id))
        unblocked.push(t.subject)
    }

    let msg = `Completed ${taskId} (${task.subject})`
    if (unblocked.length)
      msg += `\nUnblocked: ${unblocked.join(', ')}`
    return msg
  }

  /**
   * 渲染任务列表
   */
  renderList(): string {
    const tasks = this.listAll()
    if (tasks.length === 0)
      return `No tasks. Use create_task to add some.`

    const lines: Array<string> = []
    for (const t of tasks) {
      let icon: string

      switch (t.status) {
        case 'pending':
          icon = '[ ]'
          break
        case 'in_progress':
          icon = '[>]'
          break
        case 'completed':
          icon = '[x]'
          break
        default:
          icon = '[?]'
          break
      }
      const deps = t.blockedBy.length ? ` (blockedBy: ${t.blockedBy.join(', ')})` : ''
      const owner = t.owner ? ` [${t.owner}]` : ''
      lines.push(`  ${icon} ${t.id}: ${t.subject} [${t.status}]${owner}${deps}`)
    }
    return lines.join('\n')
  }
}

/**
 * 生成随机 ID
 */
function generateTaskId(): string {
  const timestamp = Math.floor(Date.now() / 1_000)
  const random = Math.floor(Math.random() * 10_000).toString().padStart(4, '0')
  return `task_${timestamp}_${random}`
}
/* ==================== 工具定义 ==================== */
export const TASK_TOOLS: Array<ToolDefinition> = [
  {
    name: 'create_task',
    description: 'Create a new task with optional blockedBy dependencies.',
    input_schema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Short title for the task',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the task',
        },
        blockBy: {
          type: 'array',
          items: { type: 'string' },
          description: 'Task IDs that must be completed before this task can start',
        },
      },
      required: ['subject'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List all tasks with status, owner, and dependencies.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'claim_task',
    description: [
      'Claim a pending task. Set owner and changes status to in_progress.',
      'Fails if dependencies are not met or task is not pending.',
    ].join('\n'),
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID to claim',
        },
      },
    },
  },
  {
    name: 'complete_task',
    description: 'Complete an in-progress task. Reports which downstream tasks are unblocked.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID to complete',
        },
      },
      required: ['task_id'],
    },
  },
]
/* ==================== 工具 Handler ==================== */

export function createTaskHandlers(taskManager: TaskManager): Record<string, ToolHandler> {
  return {
    create_task: (input) => {
      const task = taskManager.create({
        subject: input.subject as string,
        description: input.description as string || '',
        blockedBy: input.blockBy as string[] || [],
      })
      const deps = task.blockedBy.length ? `  (blockedBy: ${task.blockedBy.join(', ')})` : ''
      return `Created ${task.id}: ${task.subject}${deps}`
    },
    list_tasks: () => taskManager.renderList(),
    get_task: (input) => {
      try {
        return JSON.stringify(taskManager.get(input.task_id as string), null, 2)
      }
      catch {
        return `Error: Task ${input.task_id} not found`
      }
    },
    claim_task: input => taskManager.claimTask({ taskId: (input.task_id as string), owner: 'agent' }),
    complete_task: input => taskManager.completeTask(input.task_id as string),
  }
}
