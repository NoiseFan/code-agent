export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'
export interface MemoryEntry {
  /**
   * 短标识符
   * @example prefer_tabs
   */
  name: string
  /**
   * 描述
   */
  description: string
  /**
   * 记忆类型
   */
  type: MemoryType
  /**
   * 完整内容
   */
  content: string
  /**
   * 持久化文件名称
   * @example prefer_tabs.md
   */
  file: string
}

export interface ParsedMemory {
  name?: string
  description?: string
  type?: MemoryType
  content: string
}
