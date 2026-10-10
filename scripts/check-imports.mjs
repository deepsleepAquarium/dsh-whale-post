/**
 * ★★★ 静态检查：**用了但没 import** 的内置名 ✗✓（★`node --check` 照不出来，★只有真跑才炸 ✓）
 *
 * ★★**为什么要它** ✗✓（2026-10-10）：★这一条我们撞了**四次** ✓ ——
 *   ★`gate/index.js` 的 `readdirSync`／★`bus/selftest.mjs` 的 `copyFileSync`／
 *   ★`scripts/check-install.mjs` 的 `mkdirSync` ＋ `copyFileSync` ＋ `tmpdir` ✓。
 *   ★★★**每一次都是**语法检查通过、一跑就 `ReferenceError`**** ✓✓ —— ★而它们本该在写的时候就被拦住 ✓。
 *
 * ★★**它做什么** ✗✓：★扫一份 JS／MJS 里**用到的内置名** ✓ ⇒ ★**与"import 进来的 ＋ 自己声明的 ＋ 函数参数"对一遍** ✓ ⇒ ★**缺的报出来** ✓。
 *
 * ★★★**两个坑（★第一版都踩了 ✓）** ✗✓：
 *   ① ★**函数参数没算作声明** ✗ ⇒ ★`new Promise((resolve) => { … resolve(1) })` 会被当成"缺 `resolve`" ✓ ——
 *      ★而 `resolve` 是**参数**，★合法 ✓ ⇒ ★现在会把 `(a, b) =>` 与 `function f(a, b)` 的参数一并收进来 ✓。
 *   ② ★**字符串里的名字被当成代码** ✗ ⇒ ★测试名 `check('坏输入：resolve(null) ⇒ …')` 会被当成调用 ✓ ⇒
 *      ★**扫之前先把注释与字符串剥掉** ✓（★模板串只保留 `${…}` 里的表达式 ✓）。
 *
 * ★⚠️★**它只查"一眼能认出的内置名"** ✗✓ —— ★不做完整作用域分析 ✓ ⇒ ★**宁可漏报，不乱报** ✓
 *   （★乱报会训练人忽略红 —— ★这条今天我们刚用血学过 ✓）。
 *
 * ★用法 ✗：`node scripts/check-imports.mjs [文件...]`（★不給参数 ⇒ 扫本仓该扫的那些 ✓）
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

//   ★只查这些（★一眼能认出、且几乎只可能来自模块的 ✓）
//   ★★★**`resolve` 故意不查** ✗✓（2026-10-10 摘掉的 ✓）：★它是**最容易撞名**的一个 ✓ ——
//     ★第一版把它列在里面 ⇒ ★`new Promise((resolve) => …)` 与测试名里的 `resolve(` 都误报 ✓；
//     ★★**而实测本仓**没有任何文件从 `node:path` 裸 import 它** ✓ ⇒ ★**摘掉是零损失的降险** ✓。
//   ★★**这条纪律记住** ✗✓：★**宁可漏报，不乱报** —— ★乱报会训练人忽略红 ✓（★今天刚用血学过 ✓）。
const BUILTINS = [
  'readFileSync', 'writeFileSync', 'existsSync', 'readdirSync', 'mkdirSync', 'rmSync', 'unlinkSync',
  'copyFileSync', 'renameSync', 'statSync', 'utimesSync', 'appendFileSync', 'mkdtempSync',
  'createReadStream', 'createWriteStream', 'realpathSync', 'chmodSync',
  'join', 'dirname', 'basename', 'relative', 'extname', 'normalize',
  'tmpdir', 'homedir', 'platform', 'arch', 'cpus', 'hostname',
  'fileURLToPath', 'pathToFileURL',
  'spawnSync', 'execSync', 'execFileSync',
  'createHash', 'createHmac', 'randomUUID', 'randomBytes', 'timingSafeEqual',
  'gzipSync', 'gunzipSync', 'inflateSync', 'deflateSync',
  'StringDecoder', 'promisify', 'inherits', 'isDeepStrictEqual',
]

/** ★把注释与字符串剥掉，只留"代码"（★行号靠保留换行维持 ✓） */
function codeOnly(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    //   行注释
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') i++; continue }
    //   块注释
    if (c === '/' && c2 === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++ }
      i += 2
      continue
    }
    //   单／双引号字符串（★保留换行 ✓）
    if (c === "'" || c === '"') {
      const q = c
      i++
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === '\n') { out += '\n'; i++; continue }
        if (src[i] === q) { i++; break }
        i++
      }
      continue
    }
    //   模板串：★只保留 `${…}` 里的表达式 ✓
    if (c === '`') {
      i++
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === '\n') { out += '\n'; i++; continue }
        if (src[i] === '`') { i++; break }
        if (src[i] === '$' && src[i + 1] === '{') {
          i += 2
          let depth = 1
          while (i < n && depth > 0) {
            if (src[i] === '{') depth++
            else if (src[i] === '}') { depth--; if (depth === 0) { i++; break } }
            out += src[i]
            i++
          }
          continue
        }
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

/** ★收集"已声明"的名字：★变量／函数／类 **＋ 函数参数**（★第二版补的 ✓） */
function declaredNames(code) {
  const s = new Set()
  for (const m of code.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) s.add(m[1])
  //   解构：const { a, b: c } = …
  for (const m of code.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(':').pop().trim().replace(/=.*$/, '').trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) s.add(name)
    }
  }
  //   ★★函数／箭头的参数 ✗✓ —— ★这一条是第一版漏掉的那个坑 ✓
  for (const m of code.matchAll(/function\s*[A-Za-z_$]*\s*\(([^()]*)\)/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split('=')[0].trim().replace(/^\.\.\./, '')
      if (/^[A-Za-z_$][\w$]*$/.test(name)) s.add(name)
    }
  }
  //   ★带括号的箭头：`(a, b) =>`
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split('=')[0].trim().replace(/^\.\.\./, '')
      if (/^[A-Za-z_$][\w$]*$/.test(name)) s.add(name)
    }
  }
  //   ★不带括号的箭头：`x =>`
  for (const m of code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) s.add(m[1])
  //   ★catch (e) ✓
  for (const m of code.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) s.add(m[1])
  return s
}

/** ★收集 import 进来的名字 */
function importedNames(src) {
  const s = new Set()
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) s.add(name)
    }
  }
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) s.add(m[1])
  for (const m of src.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)/g)) s.add(m[1])
  return s
}

function checkFile(f) {
  const src = readFileSync(f, 'utf8')
  const code = codeOnly(src)
  const imported = importedNames(src)
  const declared = declaredNames(code)
  const missing = []
  for (const name of BUILTINS) {
    //   ★"被调用"才算用到：★名字后面紧跟 `(` 或 `{`（★对象简写）✓
    const used = new RegExp('(?<![\\w$.])' + name + '\\s*[({]').test(code)
    if (used && !imported.has(name) && !declared.has(name)) missing.push(name)
  }
  return missing
}

//   ★不给参数 ⇒ 扫本仓该扫的那些 ✓
let files = process.argv.slice(2)
if (!files.length) {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
  const add = (d) => {
    if (!existsSync(d)) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const p = join(d, e.name)
      if (e.isDirectory()) add(p)
      else if (/\.(mjs|js)$/.test(e.name)) files.push(p)
    }
  }
  for (const d of ['scripts', 'packages', 'example']) add(join(repo, d))
  files = files.filter((f) => statSync(f).isFile())
}

let bad = 0
for (const f of files) {
  let missing
  try { missing = checkFile(f) } catch (e) { console.log('  ★ ' + f + '：读不动（' + String(e.message).slice(0, 50) + '）'); bad++; continue }
  if (missing.length) { bad++; console.log('  ★ ' + f + '：用了但没 import ⇒ ' + missing.join('、')) }
}
console.log('\n  扫了 ' + files.length + ' 个文件，' + (bad ? '★ ' + bad + ' 个有缺' : '✓ 全都没有"用了但没 import"'))
process.exit(bad ? 1 : 0)
