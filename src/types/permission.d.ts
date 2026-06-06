import type { PermissionMode } from '../persistence/permission'

export type PermissionModeType = typeof PermissionMode[keyof PermissionMode]

// 权限行为
export type PermissionBehavior = 'allow' | 'deny' | 'ask'

export interface PermissionDecision {
  behavior: PermissionBehavior
  reason: string
}

export interface PermissionRule {
  /**
   * 工具名 或 "*"
   */
  tool: string
  behavior: PermissionBehavior
  /**
   * 路径 glob 模式
   */
  path?: string
  /**
   * 内容 glob 模式
   * 用于 bash
   */
  content?: string
}
