/**
 * 错误类别
 * 根据具体的错误类别，决定具体的恢复路径
 *
 * max_tokens 不在其中的原因：
 * 1. 它本身是一个成功的响应
 * 2. stop_reason = 'max_tokens'
 * 所以它并不是 API 错误
 */
export type ErrorCategory = 'prompt_too_long' | 'connection_error' | 'unknow'

/**
 * 恢复策略
 */
export interface RecoveryDecision {
  /**
   * 错误分类
   */
  category: ErrorCategory
  /**
   * 降级策略
   */
  action: 'compact' | 'backoff' | 'fail'
  /**
   * 重试次数
   */
  attempt: number
  /**
   * 最大重试次数
   */
  maxAttempts: number
  /**
   * 具体原因
   */
  reason: string
}
