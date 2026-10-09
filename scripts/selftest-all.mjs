/**
 * 一把跑完七件的自测（★完工判据：每件都要过"能加载 ＋ 能跑 ＋ 跑错会红"三关）。
 *   node scripts/selftest-all.mjs            跑全部
 *   node scripts/selftest-all.mjs --each     逐个单跑（看细节）
 * 判据看退出码：0 ＝ 全过／非 0 ＝ 有件没过。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv.includes('--each')
const items = ['bus', 'roster', 'types', 'deliver', 'gate', 'verify', 'cli']

const results = []
for (const p of items) {
  const file = join(repo, 'packages', p, 'selftest.mjs')
  process.stdout.write(`— ${p.padEnd(9)} `)
  const r = spawnSync(process.execPath, [file], { stdio: only ? 'inherit' : 'pipe', encoding: 'utf8' })
  const out = only ? '' : String(r.stdout ?? '')
  // ★取**最后一个** `N/M 通过`：cli 是两层自测（外层含"内层退出码 0"这一条），
  //   取第一个会显示成内层的 23/23 ⇒ 看起来像只跑了 23 条 ✗（实际 35 条）
  const all = out.match(/(\d+)\/(\d+) 通过/g) ?? []
  const summary = all.length ? all[all.length - 1] : ''
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
