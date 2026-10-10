# 上架到 DSH 插件商店（SHOP）—— **现状 ＋ 怎么真的上架**

> English: [SHOP.en.md](SHOP.en.md)
>
> **这份文件回答一件事**：**"我们的插件，到底在不在 DSH 的插件市场里？"**
> **答案：在，而且是**自动的 —— 但**不完整、也不新**（见下）。

---

## 一、那个"市场"是什么（2026-10-10 查到）

| 项 | 值 |
|---|---|
| **名字** | **`dsh-plugin-shop`**（npm 上 `0.8.6`） |
| **它自己怎么描述** | 「The DeepSeek Harness plugin shop: browse, install, enable, and update dsh plugins from a **git-auditable catalog**」 |
| **仓库** | `github.com/LivXue/dsh-plugin-shop` |
| **谁做的** | **第三方（LivXue）** —— **不是 DeepSeek 官方**（`@deepseek-ai/dsh` 是官方 CLI） |
| **目录怎么分发** | 另一个 npm 包 **`dsh-plugin-shop-catalog`**（里面是 `v1/plugins.<sha>.json`） |
| **怎么上架** | **不用提 PR** —— CONTRIBUTING 原话：「You do **not** contribute to this repository to get listed. The catalog **harvests by keyword**: add `dsh-plugin` or `deepseek-harness` to your `package.json` keywords」 |

**而"每天构建一次"**：CONTRIBUTING 说「…and publish to npm, and **the next daily build picks it up**」 ——
实测 `index.json`：`builtAt: 2026-10-09T12:39:42Z`／`count: 14257`／`rejected: 17111`。

---

## 二、我们现在的实际状态（**2026-10-10 17:1x 重测** —— ★这一版是对的 ✓）

我把它那 **14329** 条（★`builtAt: 2026-10-10T07:30:15Z` 的那一份 ✓）**逐包搜了一遍** —— **结果如下**：

| 包 | 在目录里吗 | 目录里是哪个版本 | npm 上最新 |
|---|---|---|---|
| `dsh-whale-post-bus` | **在** | `0.4.0` | `0.4.0` |
| `dsh-whale-post-roster` | **在** | `0.4.0` | `0.4.0` |
| `dsh-whale-post-types` | **在** | `0.4.0` | `0.4.0` |
| `dsh-whale-post-deliver` | **在** | `0.4.0` | `0.4.0` |
| `dsh-whale-post-gate` | **在** | `0.4.0` | `0.4.0` |
| **`dsh-whale-post-verify`** | **在** | `0.4.0` | `0.4.0` |
| **`dsh-whale-post-cli`** | **不在**（★而这是**对的** ✓） | — | `0.4.0` |

**它 2026-10-10 02:36Z 回了，两条都对上了**：
1. **`verify` 不是被拒** —— **它 10-09 17:07Z 才建、17:10Z 才可收割**，**而我查的那份目录是 12:39Z 建的** ⇒ **差几个钟头** ⇒ **今天的构建就把它收了**。
2. **而 `cli` 其实有拒绝记录 —— 是我当时看错了地方**：
   **拒绝写在公开报告 `v1/report.md` 里**，**不在 `denied.yml` 里** —— 那一行是：
   **`| dsh-whale-post-cli | no-bundle | Declares no dsh.bundle, so it is a library rather than an installable plugin. |`**
   ⇒ **它判得对**：**`cli` 是命令行入口、不是可安装插件** ⇒ **不收它是设计如此，不是漏**。
**⇒ 我已经回了一条把环合上**（**并改正了自己那句“既不在目录也不在名单”**）。

---

## 三、还有两件要留意

1. **版本会自己变 —— 而这一条已经应验了**：**每日构建抓的是 npm 上的最新** ⇒
   **2026-10-10 07:30Z 那次构建之后，六个插件全是 `0.4.0`**（**★而且是自己变的，我们什么都没提**）。
2. **那个 `catalog` 里的摘要不是我们写的** —— `metadata: "derived"` ⇒
   **它是从 npm 元数据推的**（**所以 `package.json` 的 `description`／`keywords` 就是"门面"**）。

---

## 四、一句话

**我们早就在市场里了** —— `0.1.x` 时就自动被收了，**不用提 PR**；
**现在六个插件全在、全新**（`0.4.0`）；
**而 `cli` 不在** —— **因为它不是可安装插件**（`no-bundle`），**这是对的**。

落笔：**WEB鲸**（2026-10-10 09:3x）
