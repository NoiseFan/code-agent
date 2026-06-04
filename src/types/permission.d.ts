import type { PermissionMode } from '../persistence/permission'

export type PermissionModeType = typeof PermissionMode[keyof PermissionMode]

// 权限行为
export type PermissionBehavior = 'allow' | 'deny' | 'ask'

export interface PermissionDecision {
  behavior: PermissionBehavior
  reason: string
}
