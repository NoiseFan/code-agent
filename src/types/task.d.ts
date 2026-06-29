export interface Task {
  /**
   * 任务 ID
   * task_{timestamp}_{random} 格式
   */
  id: string
  /**
   * 主题
   */
  subject: string
  /**
   * 详情
   * @default ""
   */
  description?: string
  /**
   * 状态
   */
  status: 'pending' | 'in_progress' | 'completed'
  /**
   * 所属
   * @default null
   */
  owner: string | null
  /**
   *
   * @default []
   */
  blockedBy: Array<string>
  /**
   * 任务创建时间
   */
  createAt: number
  /**
   * 任务更新时间
   */
  updateAt: number
}

export interface createTaskOptionsType {
  /**
   * 主题
   */
  subject: string
  /**
   * 详情
   * @default ""
   */
  description?: string
  /**
   *
   * @default []
   */
  blockedBy: Array<string>
}
