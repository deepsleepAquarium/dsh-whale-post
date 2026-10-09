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
  // ★★★"**崩了**"跟"**判据红**"必须分开报 ✗✓（2026-10-10 加 —— ★这是我上一轮踩的坑 ✓）：
  //   ★**病** ✗：★原来只看退出码 ✓ ⇒ ★**某个 `selftest.mjs` 崩了**（★语法错／`ReferenceError` 之类 ✓）
  //     也会报"FAIL"，★而**一条 `FAIL` 行都没有** ✓ ⇒ ★**人分不清"判据红了"还是"脚本压根没跑起来"** ✗。
  //   ★★★**为什么这个区分要紧** ✗✓：★我上一轮就把它当成"负向有效"了 ✓ ——
  //     ★**退出码非 0 ≠ 判据生效** ✓（★"最坏的那种假红" ✓）。
  //   ★★判法：★**退出码 ≠ 0 且一条 `FAIL` 行都没有** ⇒ ★**那是崩了** ✓；
  //     ★再把错误行本身抓出来（★`SyntaxError`／`ReferenceError`／…）⇒ ★**一眼看得出崩在哪** ✓。
  const crashed = r.status !== 0 && fails.length === 0
  const errLine = ((String(r.stderr ?? '') + '\n' + out).match(/^\s*((?:Syntax)?Error|ReferenceError|TypeError|RangeError)[^\n]*/m) ?? [])[0]
  results.push({ p, code: r.status, summary, crashed })
  console.log(crashed
    ? `FAIL  ★**崩了**（★退出码 ${r.status}，★**一条 FAIL 行都没有** ⇒ ★不是判据红 ✗）${errLine ? '：' + errLine.trim().slice(0, 90) : ''}`
    : `${r.status === 0 ? 'PASS' : 'FAIL'}  ${summary}${fails.length ? '   ← ' + fails.length + ' 条不过' : ''}`)
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

// ★★★包元数据（`pkgcheck`）✗✓ —— ★**"发布"这件事上我们踩过的坑，全在元数据里（不在代码里）**
//   ★★它明着钉住两条**"故意的不一致"** ✗✓：
//     · ★`cli` **不能有** `dsh` ✓（★它是**入口工具、不是插件** ✓）；
//     · ★`cli` 的 `files` **不能有** `cordis.patch.yml` ✓（★它没有补丁文件 ✓）。
//   ★为什么这两条要明着写 ✗：★"少一个字段"看起来**特别像"忘了加"** ⇒ ★**下一个人会顺手补齐** ⇒
//     ★**把 CLI 也变成插件** ✗ —— ★而这一轮**我自己的第一版判据就差点这么误报** ✓。
process.stdout.write(`— ${'pkgcheck'.padEnd(9)} `)
{
  const pr = spawnSync(process.execPath, [join(repo, 'scripts', 'pkgcheck.mjs')], { stdio: only ? 'inherit' : 'pipe', encoding: 'utf8' })
  const pout = only ? '' : String(pr.stdout ?? '')
  const pall = pout.match(/(\d+)\/(\d+) 合格/g) ?? []
  const pfails = (pout.match(/^FAIL.*$/gm) ?? [])
  results.push({ p: 'pkgcheck', code: pr.status, summary: pall.length ? pall[pall.length - 1] : '' })
  console.log(`${pr.status === 0 ? 'PASS' : 'FAIL'}  ${pall.length ? pall[pall.length - 1] : ''}${pfails.length ? '   ← ' + pfails.length + ' 处不合格' : ''}`)
}

console.log('')
const bad3 = results.filter((r) => r.code !== 0)
//   ★★汇总里也要**点名"崩了"的那几件** ✗✓（★否则"有件没过"看起来像"判据红了" ✓）——
//     ★两者要修的地方完全不同：★**判据红 ⇒ 代码有 bug** ✓；★**崩了 ⇒ 自测自己坏了** ✓。
const crashed3 = bad3.filter((r) => r.crashed)
console.log(bad3.length === 0
  ? `全过：${results.length}/${results.length} 项（退出码 0）`
  : `有件没过：${bad3.map((b) => b.p).join('、')}（退出码 ${bad3[0].code}）` +
    (crashed3.length ? `\n★★其中 **${crashed3.length} 件是"崩了"**（★不是判据红 ✗）：${crashed3.map((b) => b.p).join('、')}` : ''))
// ★★另有一个**并发压测**不在这里跑 ✗（它起十几个真子进程、慢一些）：
//   `node scripts/racetest.mjs` —— ★**改了发号或落盘就要跑它** ✓（发号撞号只在那里才看得见 ✓）
console.log('ⓘ 另有并发压测：node scripts/racetest.mjs（★改了发号／落盘就一定要跑 ✓）')
process.exit(bad3.length === 0 ? 0 : 1)
