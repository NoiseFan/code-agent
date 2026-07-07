import type { ToolInput } from '../types'
import type { PermissionDecision, PermissionModeType, PermissionRule } from '../types/permission'

/* ==================== 这是一坨屎，没写完 ==================== */

/* ==================== 权限管理器 ==================== */
export const PermissionMode = {
  default: 'default',
  plan: 'plan',
  auto: 'auto',
} as const

export const PermissionModels: PermissionModeType[] = Object.values(PermissionMode)

/* ==================== 默认规则 ==================== */

const DEFAULT_RULES: PermissionRule[] = [
  { tool: 'bash', content: 'rm -rf /', behavior: 'deny' },
  { tool: 'bash', content: 'sudo *', behavior: 'deny' },
  { tool: 'read_file', content: '*', behavior: 'allow' },
]

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
  rules: PermissionRule[]
  consecutiveDenials = 0
  maxConsecutiveDenials = 3

  constructor(mode: PermissionModeType, rules: PermissionRule[]) {
    this.setModelValue(mode)
    this.rules = rules ?? [...DEFAULT_RULES]
  }

  private setModelValue(mode: PermissionModeType): void {
    if (!PermissionModels.includes(mode))
      throw new Error(`Unknow mode: ${mode}. Choose from ${PermissionModels.join(', ')}`)
    this.mode = mode
  }

  check(name: string, input: ToolInput): PermissionDecision {
    console.log('[]', name, input)
    return {
      behavior: 'allow',
      reason: '',
    }
  }
}
