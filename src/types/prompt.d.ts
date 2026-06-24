import type { ToolDefinition } from '.'

type PromptBuilderOptions = Partial<{
  workdir: string
  tools: Array<ToolDefinition>
  memoryManager: { loadMemoryPrompt: () => string, memories: Map<string, unknown> } | undefined
  baseSystem: string
}>
