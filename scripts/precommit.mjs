/**
 * 提交前的门（`precommit`）—— **由 `hooks/pre-commit` 调用**
 *
 * **为什么要有它**：同一件事**今晚我犯了两次** ——
 *   · 第 58 轮：把**假红**（脚本崩了 ⇒ 退出码 1、**一条 FAIL 行都没有**）当成"负向有效"；
 *   · 第 63 轮：**全量明明报了"有件没过（pkgcheck）"，而我照样提交了**。
 * **"报红还提交"和"根本没跑"，后果一模一样** —— **都是把没验过的东西当成验过了**。
 * 所以**不能靠"我记得跑"** （今晚证过：我会忘）⇒ **要有东西拦住手**。
 *
 * 它做什么：跑 `scripts/selftest-all.mjs` （10 项／351 条，约 20 秒）⇒
 *   **非 0 ⇒ 打印"提交被拦下"并透传退出码** （git 见到非 0 就**不会**提交）。
 *
 * ⚠️ 它**故意不跑**那三样：
 *   · `racetest`（11 条、起十几个真子进程）／`compat`（要联网、约 45 秒）——
 *     它们是**"改到某类东西才跑"**的 （`FOR-AGENTS` 里有那张表）；
 *     **放进每次提交**会让人**嫌慢而 `--no-verify`** ⇒ **反而更糟**。
 *   · `doccheck`／`pkgcheck` **在** `selftest` 里 ⇒ **已经跑了 **。
 *
 * 怎么绕：`git commit --no-verify` —— **绕过必须显式写**。
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const r = spawnSync(process.execPath, [join(repo, 'scripts', 'selftest-all.mjs')], { stdio: 'inherit', timeout: 600000 })

if (r.status !== 0) {
  console.log('')
  console.log('提交被拦下 —— 上面有件没过（或判据条数变少）。')
  console.log('  "报红还提交"跟"根本没跑"后果一模一样：都是把没验过的东西当成验过了。')
  console.log('  ⓘ 真要跳过 ⇒ `git commit --no-verify` （绕过必须显式写）。')
  process.exit(r.status ?? 1)
}
console.log('')
console.log('提交前的门：全绿 放行 ')
