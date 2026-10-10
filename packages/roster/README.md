# dsh-whale-post-roster

> English: [roster README in English](https://github.com/deepsleepAquarium/dsh-whale-post/blob/main/packages/roster/README.en.md)

名单接口：**谁在名单里**（含**成员属性**与**群发清单**）＋ 读 JSON 的样例实现

* 提供接口：`whale.roster`
* 依赖接口：（无）
* 自测：`node selftest.mjs`（**只看退出码**：0 过／非 0 不过）

接口带 `apiVersion`；**核心不许知道任何名字** —— 名单**只在这里**，核心一行名字都没有。
**属性名也一样**：`flag(id, name)` 的 `name` 由**配置或调用方**给 ⇒ **本件里不出现任何具体属性名**。

## 接口

| 方法 | 一句话 |
|---|---|
| `list()` | 全部成员（**保留成员自带的其余字段** —— 自定义属性不会被吃掉） |
| `has(id)` | 名单里有这个人吗 |
| `label(id)` | 他叫什么（缺省退回 `id`） |
| `member(id)` | **整条成员记录**（含自定义属性）；不认识 ⇒ `undefined` |
| `flag(id, name)` | **成员属性**：两种来源都认；假值（`false`／`0`／空串）一律算"**不带**" |
| `without(ids, name)` | 从一份名单里**剔掉**带该属性的人（认不出的**原样留着**，不越权改名单） |
| `broadcast()` | **群发该发给谁** ＝ 完整名单剔掉 `groupWithout` |
| `groups()` | 有哪些组名 |
| `group(name, opts)` | 某组成员；`opts.without` 可临时剔；`opts.without: null` ⇒ 这一次不剔 |

## 名单文件（格式公开、内容自填）

```json
{ "apiVersion": 1,
  "members": [ { "id": "alice", "label": "Alice" },
               { "id": "carol", "label": "Carol", "<属性名>": true } ],
  "groups": { "all": ["alice", "carol"], "club": ["alice"] },
  "<属性名>": ["carol"] }
```

* `id` 就是**信箱目录名**（`<root>/inbox/<id>/`）。
* **成员属性两种写法都认**（任选）：① 写在成员对象上 ② 顶层同名数组。
* 成员写成**纯字符串**也认（`"alice"`）；没有 `id` 的一律丢掉。
* **坏输入不抛未捕获异常** —— 坏 JSON／不是对象／`apiVersion` 不认识 ⇒ 一律退化成**空名单**。

## 配置

| 字段 | 默认 | 含义 |
|---|---|---|
| `file` | `<root>/roster.json` | 名单文件 |
| `groupWithout` | 不配 | **群发默认剔掉**带此属性的成员；**点名不受影响**（"群发默认不到它，点名才进"） |
| `sample` | `false` | `true` ⇒ 文件不存在时用内置样例（**只为试跑**） |

## 边界

* **provider 撒谎，核心拦不住** —— 核心不认识任何名字，所以它**没法自己判定"谁才算合法成员"**；
  要防这一层就在**本件**加校验与自测。
* **组员必须出现在名单里**才投（否则"幽灵组员"会收到信 ⇒ 会往名单外的信箱写文件）。
* **发给一个组、组里剔完没人 ⇒ 拒发**（宁可不发，也不发一封没有收件人的信）。
