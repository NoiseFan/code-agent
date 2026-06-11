import type { MemoryEntry, MemoryType } from '../types/memory'
import { join } from 'node:path'
import { WORKDIR } from '../core/runtime'

// 记忆存储目录
const MEMORY_DIR = join(WORKDIR, '.memory')

// 支持的记忆类型
export const MEMORY_TYPE: Array<MemoryType> = ['user', 'feedback', 'project', 'reference']

// 记忆指南（注入系统提示词）
export const MEMORY_GUIDANCE = `When to save memories:
- User states a preference ("I like tabs", "always use pytest") -> type user
- User corrects you ("don't do X", "that was wrong because...") -> type feeback
- You learn a project fact the is not easy to infer from current code alone
  (for example: a rule exists because of comliance, or a leagcy module must
   stay untouched for business reasons) -> type: project
- You learn where an external resource lives (ticket borad, dashborad, docs URL) -> type: reference

When NOT to save:
- Anything easing derivable from code (functionn signatures, file structure, directory layout)
- Temporay task state (current branch, open PR number, current TODOS)
- Secrets or credentials (API keys, passwords)
`

export class MemoryManger {
  private memoryDir: string
  // 内存中的记忆
  memories: Map<string, MemoryEntry>

  constructor(memoryDir?: string) {
    this.memoryDir = memoryDir || MEMORY_DIR
    this.memories = new Map()
  }

  loadAll(): void {}

  loadMemoryPrompt(): string {
    return ''
  }

  saveMemory(opts: {
    name: string
    description: string
    type: MemoryType
    content: string
  }): string {
    return ''
  }

  private rebuildIndex(): void {}

  private parseFrontmatter(text: string): null {
    return null
  }
}
