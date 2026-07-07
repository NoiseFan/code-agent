import type { MemoryManger } from '../persistence/memory'
import type { SystemPromptBuilder } from '../persistence/prompt'
import type { AgentLoopOptions, ToolDefinition, ToolHandler } from '../types'
import type { MemoryType } from '../types/memory'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { WORKDIR } from './runtime'

const DANGEROUS_COMMANDS = ['rm -rf /', 'sudo', 'shutdown', 'reboot', '> /dev/']

function safePath(relativePath: string): string {
  const absolutePath = path.resolve(WORKDIR, relativePath)
  if (!absolutePath.startsWith(WORKDIR)) {
    throw new Error(`Path escapes workspace: ${relativePath}`)
  }
  if (['.env'].includes(absolutePath))
    throw new Error(`Invalid file: ${relativePath}`)
  return absolutePath
}

export const runBash: ToolHandler = (input) => {
  const command = input.command as string

  for (const dangerous of DANGEROUS_COMMANDS) {
    if (command.includes(dangerous)) {
      return 'Error: Dangerous comman blocked'
    }
  }

  const result = execSync(command, {
    cwd: WORKDIR,
    encoding: 'utf-8',
    timeout: 120_000,
    maxBuffer: 50 * 1024 * 1024,
  })
  return result.trim() || '(no output)'
}

export const runRead: ToolHandler = async (input) => {
  const filePath = safePath(input.path as string)
  const limit = input.limit as number | undefined

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    if (limit && limit < lines.length) {
      lines.length = limit
      lines.push(`... (${lines.length - limit}) more lines`)
    }
    return lines.join('\n').slice(0, 50_000)
  }
  catch (e) {
    return `Error: ${e}`
  }
}

export const runEdit: ToolHandler = async (input) => {
  const filePath = safePath(input.path as string)
  const oldText = input.old_text as string
  const newText = input.new_text as string

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    if (!content.includes(oldText))
      return `Error: Text not found in ${input.path}`

    const newContent = content.replace(oldText, newText)
    fs.writeFileSync(filePath, newContent, 'utf-8')
    return `Edited ${input.path}`
  }
  catch (e) {
    return `Error: ${e}`
  }
}

export const runWrite: ToolHandler = async (input) => {
  const filePath = safePath(input.path as string)
  const content = input.content as string

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    return `Wrote ${content.length} bytes to ${input.path}`
  }
  catch (e) {
    return `Error: ${e}`
  }
}

/* ==================== 工具 Handler ==================== */

export function createMemoryTools(
  memoryManager?: MemoryManger,
  systemManager?: SystemPromptBuilder,
): Record<string, ToolHandler> {
  return {
    save_memory: (input) => {
      if (!memoryManager)
        return ''
      const result = memoryManager.saveMemory({
        name: input.name as string,
        description: input.description as string,
        type: input.type as MemoryType,
        content: input.content as string,
      })
      if (systemManager)
        systemManager.invalidateCache()
      return result
    },
  }
}

export const BASE_TOOLS: ToolDefinition[] = [

  {
    name: 'bash',
    description: 'Run a shell command',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read file contents.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' },
        limit: { type: 'integer', description: 'Maximum lines to read' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to file',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replace exact text in file',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to edit' },
        old_text: { type: 'string', description: 'Text to find an replace' },
        new_text: { type: 'string', description: 'New text to insert' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'save_memory',
    description: 'Save a persistent memory that survives across sessions.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Short identifier (e.g. prefer_tabs, db_schema)',
        },
        description: {
          type: 'string',
          description: 'One-line summary of wht this memory captures.',
        },
        type: {
          type: 'string',
          enum: ['user', 'feedback', 'project', 'reference'],
          // 用户=偏好，反馈=更正，项目=非显而易见的项目约定，参考=外部资源链接
          description: 'user=preferences, feedback=corrections, project=non-obvious project conventions, reference=external resource pointers',
        },
        content: {
          type: 'string',
          description: 'Full memory contnet (mutil-line OK)',
        },
      },
      required: ['name', 'description', 'type', 'content'],
    },
  },
]

export const BASE_HANDLERS: AgentLoopOptions['handlers'] = {
  bash: runBash,
  read_file: runRead,
  write_file: runWrite,
  edit_file: runEdit,
}
