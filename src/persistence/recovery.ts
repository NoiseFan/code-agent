import type { ErrorCategory, RecoveryDecision } from '../types/recovery'

// 最大重试次数
export const MAX_RECOVERY_ATTEMPTS = 3
// 退避基数
const BACKOFF_BASE_DELAY = 1_000
// 退避上限
const BACKOFF_MAX_DELAY = 30_000
// 续写消息：明确说明不要重新执行
export const CONTINUATION_MESSAGE = 'Output limit hit. Continue directly from where you stopped -- no recap, no repetition. Pick up mid-sentence if needed.'

/**
 * 错误分类器
 * 判断具体错误类别，根据不同的错误使用不同的恢复策略
 */
export function classifyError(error: unknown): ErrorCategory {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  // 1. 上下文溢出类型
  if (
    message.includes('overlong_prompt')
    || (message.includes('prompt') && message.includes('long'))
  ) {
    return 'prompt_too_long'
  }

  // 2. 网络错误
  if (
    message.includes('connection')
    || message.includes('timeout')
    || message.includes('rate')
    || message.includes('429')
  ) {
    return 'connection_error'
  }
  return 'unknow'
}

/**
 * 根据具体类型选择降级方案
 */
export function chooseRecovery(category: ErrorCategory, attempt: number): RecoveryDecision {
  const maxAttempts = MAX_RECOVERY_ATTEMPTS

  switch (category) {
    case 'prompt_too_long':
      return {
        category,
        action: 'compact',
        attempt,
        maxAttempts,
        reason: 'Context too long for moal window. Compact and retry.',
      }
    case 'connection_error':
      return {
        category,
        action: 'backoff',
        attempt,
        maxAttempts,
        reason: 'Transient transport error. Back off and retry.',
      }
    default:
      return {
        category,
        action: 'fail',
        attempt,
        maxAttempts,
        reason: 'Unknow error. Cannot recover.',
      }
  }
}

/**
 * 计算退避延迟
 * 公式: min(base * 2 ^ atttempt, max) + jitter(抖动)
 * 抖动防止多个客户端同时井喷式重试
 */
export function backoffDelay(attempt: number): number {
  const dalay = Math.min(BACKOFF_BASE_DELAY * 2 ** attempt, BACKOFF_MAX_DELAY)
  const jitter = Math.random() * 1000
  return dalay + jitter
}
