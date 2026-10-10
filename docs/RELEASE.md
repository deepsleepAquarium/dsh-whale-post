# 发版清单（RELEASE）

> English: [RELEASE.en.md](RELEASE.en.md)
>
> **这份文件是什么**：**"要发一个新版本时，从头到尾做哪几步"** ——
> 按顺序做完即可；**每一步都写了"为什么"**（否则下一个人会跳过它）。
> ⓘ **发布是不可逆的**：npm 上的版本撤不回来（只能 `deprecate`，不能删）⇒ **宁慢勿错**。

---

## 第 0 步：先跑四样，**全绿才发**

```bash
★★另：**提交前的门要先装** ✗✓：`npm run hooks:install` ✓（★本地配置，★**新 clone 不会自动有** ✓）—— ★装上后，每次 `git commit` 会自动跑 `selftest`，非 0 就拒绝提交 ✓。
npm run selftest     # 10 项：加载级 ＋ 静态判据 ＋ 跨包一致 ＋ 中英对等 ＋ 包元数据
npm run racetest     # 11 条：并发发号 ＋ 并发记账
npm run doccheck     # 中英文档对等
npm run pkgcheck     # 包元数据（★发布这件事的坑全在这里）
★★另：`selftest` 会把**判据条数**跟 `scripts/criteria-baseline.mjs` 比 ✓ —— ★★**只许变多、不许悄悄变少** ✗（★删一条而不更新基准 ⇒ 非 0 退出 ✓）。
npm run compat       # ★★跨版本：真跑 npm 上已发布的那一版（★要联网，约 40 秒）
```

**再加一步不能省**：**真启一遍**（`npm run selftest` 全绿 **不等于**引擎能加载 ——
我们栽过：六个插件**全部加载不上**，而**所有自测乃至 `--dump-config` 都看不出来**）。

## 第 1 步：**先发六个插件**，再发 `cli`

```bash
# ★顺序要紧：cli 的 dependencies 钉着兄弟包的 ^<本版> ⇒
#   ★★先发 cli，它会去要**还不存在**的版本 ⇒ 装的人当场失败
for p in bus roster types deliver gate verify; do
  npm publish --workspace "packages/$p" --registry https://registry.npmjs.org
done
npm publish --workspace packages/cli --registry https://registry.npmjs.org
```

**两个坑**：
* **必须显式给 `--registry https://registry.npmjs.org`** —— 本仓 `.npmrc` 默认是镜像源，
  **镜像源不能发布**（你会看到 404／403，而**不是**"没权限"）。
* `pkgcheck` 的第 ②b 条会盯着"**依赖范围覆盖当前版本**" —— **这条是发版前唯一会拦住你的判据**。

## 第 2 步：等 npm 同步，再**真装一遍**

```bash
# ★npm 的 registry 同步要几分钟 ⇒ 不要刚发完就装
mkdir /tmp/verify && cd /tmp/verify
npm init -y
npm i dsh-whale-post-cli@<本版>
npx dsh-whale-post-cli selftest    # ★只看退出码：0 ＝ 通过
```

**为什么非做不可**："自测全绿"**不等于**"别人装得上、跑得起来" ——
而**这两件事的差别恰好在元数据里**（不是代码里）。

## 第 3 步：打 tag 并推

```bash
git tag -a v<本版> -m "v<本版>"
git push origin v<本版>
```

**为什么要 tag**：README 里写着"**别钉旧 tag**"（`0.1.x` 装进真引擎六个插件全部加载不上）——
**所以每个能用的版本都要有一个能钉的 tag**。

## 第 4 步：把文档里的"npm 上最新是哪个版本"改过来

发布前，文档里写的是"**npm 上最新是上一版／本仓库已经是本版（准备中）**" ——
**发布之后这两句就过期了** ⇒ 改成"**npm 上最新就是本版**"。

**要看的地方**：`README`／`docs/INSTALL`／`packages/cli/README`（中英各一份）＋
`CHANGELOG` 那个 `## v<本版>` 标题里的"（**准备中**）"。

## 第 5 步：改完再跑一次第 0 步

**因为第 4 步动的是文档** ⇒ `doccheck` 与 `pkgcheck` 都可能被影响（尤其**中英要同步改**）。

---

## 第 6 步：发完之后，拿**两个已发布版**对跑一次**

```bash
# ★★"仓库版 vs 旧版"跟"**两个发布版**"**不是一回事** ✗ —— npx 路径、依赖解析、包里的文件都可能不同 ✓
npx -y dsh-whale-post-cli@<新版> send --as a --to b --body ... --root <临时根>
npx -y dsh-whale-post-cli@<旧版> pump --as b --root <临时根>   # ★这个方向该**退**（★新字段进不了老版的签名域 ✗）
npx -y dsh-whale-post-cli@<旧版> send --as b --to a --body ... --root <临时根>
npx -y dsh-whale-post-cli@<新版> pump --as a --root <临时根>   # ★这个方向该**通** ✓
```

**为什么要单独做**：`npm run compat` 跑的是**仓库版 vs 上一个发布版**；
而"两个发布版"多一层现实：`npx` 装到的那份**才是别人真会装到的**。

实测（**2026-10-10 发版时** —— 具体哪一版见 `CHANGELOG`）：

| 方向 | 结果 |
|---|---|
| `<旧版>` 发 ⇒ `<新版>` 收 | **通** |
| `<新版>` 发 ⇒ `<旧版>` 收 | **退** |

**为什么两个方向不一样**：**新版往签名域加了字段** ⇒ **老版的 fail-closed 纪律不认它**
（而"新发的字段进不了老版签名域"这一条**修不了** —— 老版代码已经发出去了）。
ⓘ **具体是哪一版、退信原文是什么** ⇒ 见 `CHANGELOG` 的「必读（二）：混跑时不兼容」
（**那里是记历史的地方**；这份清单只留"怎么做" —— **这也是 `pkgcheck` 第 ⑪ 条要的**：
**清单里不许写死版本号**，否则每发一版都要回来改，漏改就发错）。

结论**写进 `CHANGELOG` 的「必读（二）」**（"先把两边都升到新版，再开始发信"）。

---

## 一张速查表

| # | 做什么 | 忘了会怎样 |
|---|---|---|
| 0 | 四样全绿 ＋ **真启一遍** | **装了不能用** |
| 1 | **先六个、后 `cli`** | **`cli` 装不上**（要的版本还不存在） |
| 2 | **真装一遍** | "发出去的那份"没人验过 |
| 3 | 打 tag ＋ 推 | 别人**没有能钉的版本** |
| 4 | 改"npm 上最新是哪个" | **文档说谎**（这是"开箱即用"的第一印象） |
| 5 | 再跑一次第 0 步 | 中英文档对不上 |

ⓘ **版本口径**：本仓 **`0.x`** 期间，次版本号（`0.1 → 0.2`）表示**接口或行为可能变**；
补丁号只表示"**不改行为**"（这条写在 `CHANGELOG` 开头）。
