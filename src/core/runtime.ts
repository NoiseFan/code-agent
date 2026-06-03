import process from 'node:process'
import Anthropic from '@anthropic-ai/sdk'
import { config } from 'dotenv'
import 'dotenv/config'

export const WORKDIR: string = process.cwd()
config({ path: WORKDIR, override: true, quiet: true })

export const MODEL: string = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'

export const client: Anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
})
