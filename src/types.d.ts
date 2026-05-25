export interface Message {
  role: 'user' | 'assistant'
  content: ContentBlock
}
export type ContentBlock = TextBlock | ToolUseBlock

interface TextDecoder {
  type: 'text'
  text: string
}

interface ToolUseBlock {
  type: 'tools_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: string
}

export interface ToolDefinition {
  name: string
  description: string
  input_schema: ToolInputSchema
}

export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, ToolProperty>
  required?: string[]
}

export interface AgentLoopOptions {
  tools: ToolDefinition[]
  handlers: Record<string, ToolHandler>
  system?: string
}

export type ToolHandler = (input: Record<string, unknown>) => string | Promise<string>
