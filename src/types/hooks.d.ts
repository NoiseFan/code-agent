import type { ToolInput } from '.'
import type { HooksEventEnum } from '../persistence/hooks'

export type HookEvent = typeof HooksEventEnum[number]

export interface HookDefinition {
  /**
   * 工具名称匹配方式
   *
   * '*' 或省略表示所有工具
   */
  matcher?: string
  /**
   * 即将执行的 Shell 命令
   */
  command: string
}
export interface HookContext {
  /**
   * 工具名称
   */
  tool_name: string
  /**
   * 工具输入参数
   */
  tool_input: ToolInput
  /**
   * 工具输出结果
   */
  tool_output?: string
}

export interface HookResult {
  /**
   * 是否阻止工具执行
   */
  blocked: boolean
  /**
   * 阻止的原因
   */
  blockReson?: string
  /**
   * 注入给模型的信息
   */
  messages: Array<string>
}
