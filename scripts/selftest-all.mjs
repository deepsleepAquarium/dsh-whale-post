/**
 * 一把跑完六件的自测（★完工判据：每件都要过"能加载 ＋ 能跑 ＋ 跑错会红"三关）。
 *   node scripts/selftest-all.mjs            跑全部
 *   node scripts/selftest-all.mjs --each     逐个单跑（看细节）
 * 判据看退出码：0 ＝ 全过／非 0 ＝ 有件没过。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv.includes('--each')
const items = ['bus', 'roster', 'types', 'deliver', 'gate', 'cli']

const results = []
for (const p of items) {
  const file = join(repo, 'packages', p, 'selftest.mjs')
  process.stdout.write(`— ${p.padEnd(9)} `)
  const r = spawnSync(process.execPath, [file], { stdio: only ? 'inherit' : 'pipe', encoding: 'utf8' })
  const out = only ? '' : String(r.stdout ?? '')
  const summary = (out.match(/(\d+)\/(\d+) 通过/) ?? [])[0] ?? ''
  const fails = (out.match(/^FAIL.*$/gm) ?? [])
  results.push({ p, code: r.status, summary })
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  ${summary}${fails.length ? '   ← ' + fails.length + ' 条不过' : ''}`)
}

console.log('')
const bad = results.filter((r) => r.code !== 0)
console.log(bad.length === 0
  ? `全过：${results.length}/${results.length} 件（退出码 0）`
  : `有件没过：${bad.map((b) => b.p).join('、')}（退出码 ${bad[0].code}）`)
process.exit(bad.length === 0 ? 0 : 1)
