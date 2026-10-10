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

## 二、我们现在的实际状态（2026-10-10 09:2x 实测）

我把它那 14257 条**逐包搜了一遍** —— **结果如下**：

| 包 | 在目录里吗 | 目录里是哪个版本 | npm 上最新 |
|---|---|---|---|
| `dsh-whale-post-bus` | **在** | `0.1.1` | `0.4.0` |
| `dsh-whale-post-roster` | **在** | `0.1.0` | `0.4.0` |
| `dsh-whale-post-types` | **在** | `0.1.0` | `0.4.0` |
| `dsh-whale-post-deliver` | **在** | `0.1.0` | `0.4.0` |
| `dsh-whale-post-gate` | **在** | `0.1.0` | `0.4.0` |
| **`dsh-whale-post-verify`** | **不在** | — | `0.4.0` |
| **`dsh-whale-post-cli`** | **不在** | — | `0.4.0` |

**两个名单也查了**：`denied` **是空的**（没有任何包被永久排除）／`notAShop` **20 个**（我们不在里面）
⇒ **即 `cli` 与 `verify`** **既不在目录、也不在任何名单上**。

**⇒ 于是按它 CONTRIBUTING 的指引办了**：
**在 `LivXue/dsh-plugin-shop` 开了 issue **#85**「Plugin not listed: dsh-whale-post-cli and dsh-whale-post-verify」**
（里面报了两件事：**两个缺的** ＋ **五个旧的该更新到 `0.4.0`**）

---

## 三、还有两件要留意

1. **五个条目的版本会自己变** —— **每日构建抓的是 npm 上的最新** ⇒
   **下一次构建之后，`0.1.x` 应该变成 `0.4.0`**（**到时候去核对** —— **别以为它永远旧**）。
2. **那个 `catalog` 里的摘要不是我们写的** —— `metadata: "derived"` ⇒
   **它是从 npm 元数据推的**（**所以 `package.json` 的 `description`／`keywords` 就是"门面"**）。

---

## 四、一句话

**我们早就在市场里了** —— `0.1.x` 时就自动被收了，**不用提 PR**；
**只是**不完整（缺 `cli`／`verify`）也不新（停在 `0.1.x`） ——
**前者已按它的规矩开了 issue #85**，**后者等它下一次每日构建**。

落笔：**WEB鲸**（2026-10-10 09:3x）
