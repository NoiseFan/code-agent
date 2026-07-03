import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pc from 'picocolors'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const sessionsDir = resolve(root, 'src/sessions')
const pkgPath = resolve(root, 'package.json')

// 1. scan sessions directory for sXX-*.ts files
const pattern = /^s(\d+)-.+\.ts$/
const files = readdirSync(sessionsDir)
  .map((name) => {
    const match = name.match(pattern)
    return match ? { name, num: Number.parseInt(match[1], 10) } : null
  })
  .filter(Boolean)
  .sort((a, b) => a!.num - b!.num) as { name: string, num: number }[]

// 2. read package.json
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

// 3. remove old sXX entries, then add fresh ones
const scripts: Record<string, string> = {}
for (const [key, value] of Object.entries(pkg.scripts ?? {})) {
  if (!/^s\d+$/.test(key)) {
    scripts[key] = value as string
  }
}
for (const { name, num } of files) {
  // zero-pad: keep existing convention (s01, not s1)
  const key = `s${String(num).padStart(2, '0')}`
  // strip .ts extension to form the command key
  scripts[key] = `tsx src/sessions/${name}`
}

// 4. keep script order: other scripts first, then sXX sorted
//    (Object keys preserve insertion order)
const ordered: Record<string, string> = {}
const sKeys: string[] = []
for (const key of Object.keys(scripts)) {
  if (/^s\d+$/.test(key)) {
    sKeys.push(key)
  }
  else {
    ordered[key] = scripts[key]
  }
}
sKeys.sort()
for (const key of sKeys) {
  ordered[key] = scripts[key]
}

pkg.scripts = ordered

// 5. write back with trailing newline (match existing style)
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

console.log(`${pc.green('✓')} Synced ${pc.cyan(files.length)} session scripts: ${pc.yellow(sKeys.join(', '))}`)
