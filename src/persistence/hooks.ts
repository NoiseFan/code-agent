import type { HookContext, HookDefinition, HookEvent, HookResult } from '../types/hooks'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import pc from 'picocolors'
import { WORKDIR } from '../core/runtime'

export const HooksEventEnum = ['SessionStart', 'PreToolUse', 'PostToolUse'] as const

//  Hook 命令的退出码约定
enum HookExitCode {
  /**
   * 继续执行
   * 继续执行，什么都不做
   */
  Contiune,
  /**
   * 阻止执行
   * 阻止工具执行
   */
  Block,
  /**
   * 注入消息
   * 继续执行，但注入消息给模型
   */
  InjectMessage,
}

interface HookExecutionResult {
  /**
   * hook 执行退出码
   */
  exitCode: HookExitCode
  /**
   * 输出结果
   */
  stdout: string
  /**
   * 错误输出
   * 注入消息将从此字段取出
   */
  stderr: string
}

// HOOK 配置文件路径
const DEFAULT_CONFIG_PATH = path.join(WORKDIR, '.hooks.json')
// 当前工作区信任文件标记
export const TRUST_MARKER: string = path.join(WORKDIR, '.claude', '.claude_trusted')
// Hook 执行超时时间
const HOOK_TIMEOUT = 30

/**
 * HOOK 管理器
 *
 * 主要负责三件事：
 * 1. 加载配置：从 .hook.json 读取 hook 定义
 * 2. 执行 hook：运行 shell 命令
 * 3. 返回结果：告诉主 AgentLoop 是否阻止、注入消息
 */
export class HookManager {
  // 存储所有的 Hook 配置（将按照事件类型进行分类）
  hooks: Record<HookEvent, Array<HookDefinition>>

  // 是否为 SDK 模式（SDK模式将隐式进行信任）
  private sdkMode: boolean
  constructor(opts?: { configPath?: string, sdkMode?: boolean }) {
    const { configPath, sdkMode = false } = opts || {}
    // 初始化空的 hook
    this.hooks = {
      SessionStart: [],
      PreToolUse: [],
      PostToolUse: [],
    }
    this.sdkMode = sdkMode

    this.loadConifg(configPath || DEFAULT_CONFIG_PATH)
  }

  private loadConifg(configPath: string): void {
    if (!existsSync(configPath))
      return

    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))

      // 从 config.hooks 中读取各个事件的 Hook
      const hookConfig = config.hooks || {}
      for (const event of HooksEventEnum) {
        if (Array.isArray(hookConfig[event]))
          this.hooks[event] = hookConfig[event]
      }
      console.log(`[Hooks loaded from ${configPath}]`)
    }
    catch (e) {
      console.warn(`[Hook config error: ${e}]`)
    }
  }

  /**
   * 检查工作区是否被信任
   */
  private checkWorkspaceTrust(): boolean {
    // SDK 模式下隐式信任
    if (this.sdkMode)
      return true

    // 检查信任标记是否存在
    return existsSync(TRUST_MARKER)
  }

  /**
   * 检查工具是否与工具名称是否匹配
   */
  private matches(matcher?: string, toolName?: string): boolean {
    if (!matcher || matcher === '*' || toolName)
      return true

    // 精确匹配
    return matcher === toolName
  }

  /**
   * 执行某个事件所有 Hook
   *
   * @param event 事件名称
   * @param context 当时所在上下文
   * @returns HookResult: 是否阻止、是否注入消息
   */
  runHooks(event: HookEvent, context?: HookContext): HookResult {
    const result: HookResult = {
      blocked: false,
      messages: [],
    }

    // 1. 信任检查：不信任的工作区不执行 Hook
    if (!this.checkWorkspaceTrust())
      return result

    // 2. 获取该事件所有的 Hook
    const hooks = this.hooks[event] || []

    // 3. 遍历执行每一个 Hook
    for (const hook of hooks) {
      // 3.1 检查 matcher 与工具是否匹配
      if (!this.matches(hook.matcher, context?.tool_name))
        continue

      // 3.2 执行 hook 命令
      const hookExecResult = this.executeHook(hook, context, event)

      // 3.3 根据退出码处理结果
      if (hookExecResult.exitCode === HookExitCode.Block) {
        result.blocked = true
        result.blockReson = hookExecResult.stderr.trim() || 'Blocked by hook'
        console.log(`  [hook:${event}] BLOCKED: ${result.blockReson}`)
      }
      else if (hookExecResult.exitCode === HookExitCode.InjectMessage) {
        const message = hookExecResult.stderr.trim()
        if (message) {
          result.messages.push(message)
          console.log(`  [hook:${event} INJECT: ${message.slice(0, 200)}]`)
        }
      }
      else if (hookExecResult.exitCode === HookExitCode.Contiune) {
        continue
      }
    }

    return result
  }

  private executeHook(hook: HookDefinition, context: HookContext | undefined, event: HookEvent): HookExecutionResult {
    // 1. 构建环境便利，将上下文传递给 Hool
    const env: Record<string, string | undefined> = {
      ...process.env,
      HOOK_EVENT: event,
      HOOK_TOOL_NAME: context?.tool_name,
      HOOK_INPUT: JSON.stringify(context?.tool_input),
    }

    // 2. PostToolUse 时还要传递输出
    if (context?.tool_output)
      env.HOOK_TOOL_OUTPUT = context.tool_output

    try {
      const output = execSync(hook.command, {
        cwd: WORKDIR,
        env,
        encoding: 'utf-8',
        timeout: HOOK_TIMEOUT * 1000,
        stdio: ['pipe', 'pipe', 'pipe'], // 捕获 stdout, stderr
      })

      // 命令执行成功，退出码为 0
      // 注意：execSync 成功时只返回 stdout, stderr 需要额外获取
      if (output.trim())
        console.log(`  ${pc.green('[hook]')} ${output.trim().slice(0, 100)}`)

      return {
        exitCode: HookExitCode.Contiune,
        stdout: output,
        stderr: '',
      }
    }
    catch (e: unknown) {
      // 命令执行失败（即退出码不为 0）
      const execError = e as {
        status?: number
        stdout?: string
        stderr?: string
        message?: string
      }

      // 获取原始退出码，即 shell 返回的数字
      const exitCode = execError.status || 1

      // 获取 stdout、stderr
      const stdout = execError.stdout || ''
      const stderr = execError.stderr || ''

      if (stdout.trim())
        console.log(`  [hook stdout] ${stdout.trim().slice(0, 100)}`)

      if (stderr.trim())
        console.log(`  [hook stderr] ${stderr.trim().slice(0, 100)}`)

      return {
        exitCode,
        stdout,
        stderr,
      }
    }
  }
}
