export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export interface MemoryMeta {
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
   * 完整内容
   */
  type: MemoryType
  /**
   * 完整内容
   */
  content: string
}

export type MemoryEntry = MemoryMeta & {
  /**
   * 持久化文件名称
   * @example prefer_tabs.md
   */
  file: string
}

export type ParsedMemory = Partial<MemoryMeta>
