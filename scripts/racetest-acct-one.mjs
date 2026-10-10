/**
 * `racetest` 的零件：**记一笔就走** （并发记账压测用）
 *
 * 为什么单独一个文件：
 *   ① Windows 的 ESM 吃不了 `D:/…` 这种绝对路径（早先栽过）⇒ 子进程得能 `import` 到仓库里的东西；
 *   ② 若让父脚本每次**写一个临时文件** ⇒ 要么把工作区弄脏（`git status` 老有改动）、
 *      要么写完就删（那"它到底测了什么"就查不到了）⇒ 放仓库里跟着提交最干净。
 *
 * 它做的事**只有一件**：往 `argv[2]` 那个根的配额台账里**记一笔** 
 *   （上限配得很大 ⇒ 不会因为越额而改变行为）。
 */
import { createGate } from '../packages/gate/index.js'

const g = createGate({ root: process.argv[2], quota: { types: { direct: { label: 'd', limit: 999999 } } } })
g.record({ as: 'w', to: 'b', targets: ['b'], mode: 'online', type: 'direct', body: '并发记账压测（正文有货，别当回执）' }, ['b'])
