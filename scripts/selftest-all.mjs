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

// ★★ 静态判据（接真引擎那一关换来的 ✗）：**源码里不许读写 `ctx.whale` 这个属性**。
//   真 Cordis 里读 `ctx.whale` 要先 `inject`，没声明就抛
//   `cannot get property "whale" without inject` ⇒ ★六个插件**全都加载不上** ✓；
//   而 `--dump-config` 只组配置树、不跑 `apply()` ⇒ **完全看不出来**，
//   只有"真启一遍"才会炸。所以把它钉成一条静态判据，免得下一个人再踩。
import { readFileSync as _readFileSync, readdirSync as _readdirSync } from 'node:fs'
{
  const offenders = []
  for (const p of ['bus', 'roster', 'types', 'deliver', 'gate', 'verify', 'cli']) {
    let src = ''
    try { src = _readFileSync(join(repo, 'packages', p, 'index.js'), 'utf8') } catch { continue }
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    if (/ctx\.whale\s*=|ctx\?\.whale\?\./.test(codeOnly)) offenders.push(p)
  }
  console.log(`— ${'static'.padEnd(9)} ${offenders.length === 0 ? 'PASS  无 ctx.whale 属性读写（★真引擎上会抛 without inject）' : 'FAIL  这几件还在读 ctx.whale：' + offenders.join('、')}`)
  if (offenders.length) process.exitCode = 1
}
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
//   ★为什么单列一步 ✗：★它盯的**不是"某一件事对不对"，而是"**同一件事在两件里算得一样吗**"** ✓ ——
//   ★我们踩过两次：★`verify` 自己抄了一份 `FIELD_ORDER`（合法信被判"未登记"、当场退信 ✗）／
//     ★`gate` 与 `verify` 各算一份日界（★差一天而**谁都不报错** ✓）。
//   ★★它的判据也是**退出码** ✓（0 全一致／非 0 有漂移 ✓）。
// ★★★跨包一致性（`xcheck`）✗✓ —— ★**漂移探测器**
//   ★为什么单列一步 ✗：★它盯的**不是"某一件事对不对"，而是"**同一件事在两件里算得一样吗**"** ✓ ——
//   ★我们踩过两次：★`verify` 自己抄了一份 `FIELD_ORDER`（合法信被判"未登记"、当场退信 ✗）／
//     ★`gate` 与 `verify` 各算一份日界（★差一天而**谁都不报错** ✓）。
//   ★★它的判据也是**退出码** ✓（0 全一致／非 0 有漂移 ✓）。
process.stdout.write(`— ${'xcheck'.padEnd(9)} `)
{
  const xr = spawnSync(process.execPath, [join(repo, 'scripts', 'xcheck.mjs')], { stdio: only ? 'inherit' : 'pipe', encoding: 'utf8' })
  const xout = only ? '' : String(xr.stdout ?? '')
  const xall = xout.match(/(\d+)\/(\d+) 一致/g) ?? []
  const xfails = (xout.match(/^FAIL.*$/gm) ?? [])
  results.push({ p: 'xcheck', code: xr.status, summary: xall.length ? xall[xall.length - 1] : '' })
  console.log(`${xr.status === 0 ? 'PASS' : 'FAIL'}  ${xall.length ? xall[xall.length - 1] : ''}${xfails.length ? '   ← ' + xfails.length + ' 条漂移' : ''}`)
}

// ★★另有一个**并发压测**不在这里跑 ✗（它起十几个真子进程、慢一些）：
//   `node scripts/racetest.mjs` —— ★**改了发号或落盘就要跑它** ✓（发号撞号只在那里才看得见 ✓）
// ★★★中英文档的**结构对等**（`doccheck`）✗✓
//   ★为什么单列一步 ✗：★它抓的不是"代码对不对"、也不是"跨包一致吗" ✓，而是
//   ★★**"两种语言的说明，还是同一份说明吗"** ✓ —— ★我们在这上面栽过两次：
//     ★中文 `README` 整整缺了两段（★**而缺的偏偏是"仍未测"那种**诚实声明** ✗** ✓）／
//     ★英文 `CHANGELOG` 缺了一整条 ✓（★都是"只数标题"的复核放过去的 ✓）。
process.stdout.write(`— ${'doccheck'.padEnd(9)} `)
{
  const dr = spawnSync(process.execPath, [join(repo, 'scripts', 'doccheck.mjs')], { stdio: only ? 'inherit' : 'pipe', encoding: 'utf8' })
  const dout = only ? '' : String(dr.stdout ?? '')
  const dall = dout.match(/(\d+)\/(\d+) 对等/g) ?? []
  const dfails = (dout.match(/^FAIL.*$/gm) ?? [])
  results.push({ p: 'doccheck', code: dr.status, summary: dall.length ? dall[dall.length - 1] : '' })
  console.log(`${dr.status === 0 ? 'PASS' : 'FAIL'}  ${dall.length ? dall[dall.length - 1] : ''}${dfails.length ? '   ← ' + dfails.length + ' 处不对等' : ''}`)
}

console.log('')
const bad3 = results.filter((r) => r.code !== 0)
console.log(bad3.length === 0
  ? `全过：${results.length}/${results.length} 项（退出码 0）`
  : `有件没过：${bad3.map((b) => b.p).join('、')}（退出码 ${bad3[0].code}）`)
// ★★另有一个**并发压测**不在这里跑 ✗（它起十几个真子进程、慢一些）：
//   `node scripts/racetest.mjs` —— ★**改了发号或落盘就要跑它** ✓（发号撞号只在那里才看得见 ✓）
console.log('ⓘ 另有并发压测：node scripts/racetest.mjs（★改了发号／落盘就一定要跑 ✓）')
process.exit(bad3.length === 0 ? 0 : 1)
process.exit(bad2.length === 0 ? 0 : 1)
