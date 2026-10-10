/**
 * 一份文档的**结构快照**（`doc-shape`）—— **只此一份** 
 *
 * **为什么单独抽出来** （2026-10-10 17:1x）：
 *   `doccheck` 靠它比**中英两份**的对等；而“**改写前后同一份**的结构有没有变”
 *   也要靠它 —— **两件事用同一个计数口径** 
 *   （否则一边改了计法、另一边还按旧的算 ⇒ 两边说法不一样）。
 *
 * 它算什么：标题（含逐层级）、条目、表格数与**每张表的列数**、代码围栏数、
 *   链接数、行数。
 * **一个关键细节**：先**剥掉代码块**再数 ——
 *   否则 shell 注释里的 `# ` 会被当标题、`* ` 会被当条目 （当年就这么误报过）。
 */

/** 一份文档的结构快照 */
function profile(text) {
  const lines = text.split(/\r?\n/)
  //   先**剥掉代码块** —— 否则代码里的 `# 注释` 会被当标题（我第一版就误报过：
  //     "标题数 21 vs 23"，查了半天才发现多出来的是 shell 注释）、`* ` 会被当条目。
  //   ⓘ 围栏**本身**要单独数（那是"代码块数对等"这条判据要的）⇒ 先数、再剥。
  const fences = (text.match(/^```/gm) ?? []).length
  const body = []
  let inFence = false
  for (const l of lines) {
    if (/^```/.test(l)) { inFence = !inFence; continue }
    if (!inFence) body.push(l)
  }
  const headings = body.filter((l) => /^#{1,6} /.test(l)).map((l) => l.replace(/^#{1,6} /, '').replace(/^[0-9]+[.、]\s*/, '').trim())
  const byLevel = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  for (const l of body) { const m = /^(#{1,6}) /.exec(l); if (m) byLevel[m[1].length] += 1 }
  const bullets = body.filter((l) => /^\* /.test(l)).length
  let tables = 0
  let inTable = false
  const tableWidths = []
  let cur = []
  for (const l of body) {
    const isRow = l.trimStart().startsWith('|')
    if (isRow) { if (!inTable) { inTable = true; tables += 1; cur = [] } cur.push((l.replace(/\\\|/g, 'X').match(/\|/g) ?? []).length) }
    else if (inTable) { inTable = false; tableWidths.push(new Set(cur).size === 1 ? cur[0] : -1) }
  }
  if (inTable) tableWidths.push(new Set(cur).size === 1 ? cur[0] : -1)
  const tableRows = body.filter((l) => l.trimStart().startsWith('|')).length
  const links = (body.join('\n').match(/\]\([^)]*\)/g) ?? []).length
  return { lines: lines.length, headings, byLevel, bullets, tables, tableRows, tableWidths, fences, links }
}

export { profile }
