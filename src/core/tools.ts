import type { ToolDefinition, ToolHandler } from '../types'
import { execSync } from 'node:child_process'
import { WORKDIR } from './agent-loop'

const DANGEROUS_COMMANDS = ['rm -rf /', 'sudo', 'shutdown', 'reboot', '> /dev/']

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
]
