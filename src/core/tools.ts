import type { ToolDefinition, ToolHandler } from '../types'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import pc from 'picocolors'
import { WORKDIR } from './agent-loop'

const DANGEROUS_COMMANDS = ['rm -rf /', 'sudo', 'shutdown', 'reboot', '> /dev/']

function safePath(relativePath: string): string {
  const absolutePath = path.resolve(WORKDIR, relativePath)
  if (!absolutePath.startsWith(WORKDIR)) {
    throw new Error(`Path escapes workspace: ${relativePath}`)
  }
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

  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  if (limit && limit < lines.length) {
    lines.length = limit
    lines.push(`... (${lines.length - limit}) more lines`)
  }
  return lines.join('\n').slice(0, 50_000)
}

export const runEdit: ToolHandler = async (input) => {
  const filePath = safePath(input.path as string)
  const oldText = input.old_text as string
  const newText = input.new_text as string

  const content = fs.readFileSync(filePath, 'utf-8')
  if (!content.includes(oldText))
    return `Error: Text not found in ${input.path}`

  const newContent = content.replace(oldText, newText)
  fs.writeFileSync(filePath, newContent, 'utf-8')
  return `Edited ${input.path}`
}

export const runWrite: ToolHandler = async (input) => {
  const filePath = safePath(input.path as string)
  const content = input.content as string

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
  return `Wrote ${content.length} bytes to ${input.path}`
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string | undefined> {
  if (name === 'bash') {
    const command = input.command as string
    const output = await runBash({ command })
    return output
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
]

export const BASE_HANDLERS: Record<string, ToolHandler> = {
  bash: runBash,
  read_file: runRead,
  write_file: runWrite,
  edit_file: runEdit,
}
