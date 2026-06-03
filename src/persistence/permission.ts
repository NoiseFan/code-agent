import type { PermissionModeType } from '../types/permission'

/* ==================== 权限管理器 ==================== */
export const PermissionMode = {
  default: 'default',
  plan: 'plan',
  auto: 'auto',
} as const

export const PermissionModels: PermissionModeType[] = Object.values(PermissionMode)

/**
 * 权限管理器
 *
 * 核心管道：
 * 1. deny rules  -> 命中了就拒绝（优先挡掉危险操作）
 * 2. mode check  -> 根据当前模式决定
 * 3. allow rules -> 命中就放行
 * 4. ask user    -> 剩下交给用户确认
 */
export class PermissionManager {
  mode: PermissionModeType
  constructor(mode: PermissionModeType) {
    this.setModelValue(mode)
  }

  private setModelValue(mode: PermissionModeType): void {
    if (!PermissionModels.includes(mode))
      throw new Error(`Unknow mode: ${mode}. Choose from ${PermissionModels.join(', ')}`)
    this.mode = mode
  }
}
