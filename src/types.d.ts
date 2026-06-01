import type { TODOEnum, TodoManger } from './planning/todo'

export interface Message {
  role: 'user' | 'assistant'
  content: ContentBlock
}
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

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
  type: 'object' | 'array' | 'string' | 'integer'
  properties?: Record<string, ToolProperty>
  required?: string[]
}
export interface ToolProperty extends ToolInputSchema {
  description?: string
  enum?: string[]
  items?: ToolProperty
}

export interface SubAgentContext {
  /**
   * 子 Agent 独立的上下文
   */
  messages: Message[]
  /**
   * 子 Agent 可使用的工具
   */
  tools: ToolDefinition[]
  /**
   * 工具的执行函数
   */
  handlers: Record<string, ToolHandler>
  /**
   * 最大轮次
   */
  maxTurns: number
  systemPrompt: string
}

export interface AgentLoopOptions {
  tools: ToolDefinition[]
  handlers: Record<string, ToolHandler>
  system?: string
  todoManager?: TodoManger
}

export type ToolHandler = (input: Record<string, unknown>) => string | Promise<string>

/* ==================== TODO ==================== */

export interface TodoItem {
  id: string
  content: string
  status: TODOEnum
  activeForm?: string
}

export interface PlanningState {
  items: TodoItem[]
  roundSinceUpdate: number
}
