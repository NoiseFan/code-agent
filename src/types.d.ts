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

interface ToolDefinition {}
export interface AgentLoopOptions {
  tools: ToolDefinition[]
  handlers: Record<string, ToolDefinition>
  system?: string
}
