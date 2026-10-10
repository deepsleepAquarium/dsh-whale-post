/**
 * 把"注释与字符串"剥掉，只留代码 —— **只此一份**（`code-only`）
 *
 * 为什么要有它 （2026-10-10 加，第 126 轮）：
 *   本仓有两处要"只看代码、不看注释与字符串"：
 *     · `check-imports` —— 找"用了但没 import"的内建名；
 *     · `selftest-all` 的静态判据 —— 找源码里有没有读写 `ctx.whale` 属性。
 *   而**两边各写了一份**，还都不一样：
 *     · `check-imports` 那份会剥字符串、会跳过模板串，**但曾经不认正则字面量** ——
 *       于是一句 `if (/^```/.test(line))` 里的反引号被当成模板串开头，**把后面整份文件吞掉**，
 *       守卫对那份文件就瞎了（第 125 轮实测：它瞎掉的恰好是 `doccheck.mjs`）；
 *     · `selftest-all` 那份**只删块注释与行首 `//`** —— **字符串一个字不剥** ⇒
 *       一条合法的错误提示里只要出现 `ctx.whale =`，静态判据就会**误报**。
 *   **仓库自己的纪律是"这类计数／判定的逻辑只许有一份"** ⇒ 抽到这里，两边都用它。
 *
 * 它怎么剥：
 *   · 行注释 `//…` 与块注释 `/*…*​/`：删掉（**保留换行**，行号才不乱）；
 *   · 单／双引号字符串：删掉；
 *   · 模板串：**只保留 `${…}` 里的表达式**（那才是代码）；
 *   · **正则字面量：整段跳过** —— 判据是"前一个有意义的字符像不像正则的开头"；
 *   · 其它字符原样保留。
 *
 * ⚠️ **它不保证 100% 正确**：正则是靠启发式认的（`a / b` 会被当除号、不跳 ✓）。
 *   而它的两个用处都不怕这个：**宁可多留一点代码**（那只会多报，不会漏报）。
 */

/** 剥掉注释与字符串，只留代码（**行号靠保留换行维持**） */
export function codeOnly(src) {
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
    //   单／双引号字符串（保留换行）
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
    //   模板串：只保留 `${…}` 里的表达式
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
    //   正则字面量：整段跳过（见文件头注释里那条实测）
    if (c === '/' && isRegexStart(out)) {
      i++
      let inClass = false
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === '\n') break
        if (src[i] === '[') inClass = true
        else if (src[i] === ']') inClass = false
        else if (src[i] === '/' && !inClass) { i++; break }
        i++
      }
      while (i < n && /[a-z]/.test(src[i])) i++
      out += ' '
      continue
    }
    out += c
    i++
  }
  return out
}

/** `/` 之前那个有意义的字符 ⇒ 判断它是不是正则的开头 */
function isRegexStart(sofar) {
  const m = /[^\s]\s*$/.exec(sofar)
  if (!m) return true
  return '(,=:[!&|?{};+-*%~^<>'.includes(m[0])
}
