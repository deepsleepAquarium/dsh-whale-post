# Listing in the DSH plugin shop (SHOP) —— ★**where we stand, and how to actually get listed** ✗✓

> 中文: [SHOP.md](SHOP.md)
>
> ★★**This file answers one question** ✗✓: ★**"Are we in the DSH plugin marketplace, or not?"**
> ★★★**Answer: ★yes, and it is **automatic** —— ★but **incomplete and stale**** ✓✓ (★see below ✓).

---

## ★ 1. What that "marketplace" is ✗ (★checked on 2026-10-10 ✓)

| Item | Value |
|---|---|
| ★★ **Name** ✗ | ★**`dsh-plugin-shop`** (★`0.8.6` on npm ✓) |
| ★★ **Its own description** ✗✓ | ★"The DeepSeek Harness plugin shop: browse, install, enable, and update dsh plugins from a **git-auditable catalog**" ✓ |
| ★★ **Repository** ✗ | ★`github.com/LivXue/dsh-plugin-shop` ✓ |
| ★★ **Who made it** ✗✓ | ★★**a third party (LivXue)** —— ★**not DeepSeek's own** ✗ (★`@deepseek-ai/dsh` is the official CLI ✓) |
| ★★ **How the catalog ships** ✗ | ★as another npm package, **`dsh-plugin-shop-catalog`** (★containing `v1/plugins.<sha>.json` ✓) |
| ★★★ **★How you get listed** ✗✓ | ★★**you do not file a PR** ✓ —— ★CONTRIBUTING, verbatim: ★"You do **not** contribute to this repository to get listed. The catalog **harvests by keyword**: add `dsh-plugin` or `deepseek-harness` to your `package.json` keywords" ✓ |

★★ **And it rebuilds daily** ✗✓: ★CONTRIBUTING says "…and publish to npm, and **the next daily build picks it up**" ✓ ——
★measured `index.json`: ★`builtAt: 2026-10-09T12:39:42Z` / ★`count: 14257` / ★`rejected: 17111` ✓.

---

## ★★ 2. Where we actually stand ✗ (★measured 2026-10-10 09:2x ✓)

★I searched all 14257 entries **package by package** ✓ —— ★**the result** ✗:

| package | in the catalog? | catalog version | latest on npm |
|---|---|---|---|
| ★`dsh-whale-post-bus` ✗ | ★**yes** ✓ | ★`0.1.1` | ★`0.4.0` |
| ★`dsh-whale-post-roster` ✗ | ★**yes** ✓ | ★`0.1.0` | ★`0.4.0` |
| ★`dsh-whale-post-types` ✗ | ★**yes** ✓ | ★`0.1.0` | ★`0.4.0` |
| ★`dsh-whale-post-deliver` ✗ | ★**yes** ✓ | ★`0.1.0` | ★`0.4.0` |
| ★`dsh-whale-post-gate` ✗ | ★**yes** ✓ | ★`0.1.0` | ★`0.4.0` |
| ★★★ **`dsh-whale-post-verify`** ✗✓ | ★★ **no** ✗ | — | ★`0.4.0` |
| ★★★ **`dsh-whale-post-cli`** ✗✓ | ★★ **no** ✗ | — | ★`0.4.0` |

★★ **Both exclusion lists were checked too** ✗✓: ★`denied` **is empty** (★nothing is permanently excluded, us included ✓) / ★`notAShop` **has 20 names** (★we are not among them ✓)
⇒ ★★★**so `cli` and `verify` are **in neither the catalog nor any list**** ✓✓.

★★★ **⇒ So I followed its own CONTRIBUTING** ✗✓:
★★ **opened issue **#85** in `LivXue/dsh-plugin-shop`: "Plugin not listed: dsh-whale-post-cli and dsh-whale-post-verify"** ✓✓
(★it reports both things: ★**the two missing** + ★**the five stale ones that should move to `0.4.0`** ✓)

---

## ★★ 3. Two things to keep in mind ✗✓

1. ★★ **The five listed versions will change on their own** ✗✓ —— ★★**the daily build harvests the latest on npm** ✓ ⇒
   ★**after the next build, `0.1.x` should become `0.4.0`** ✓ (★**go and check then** ✓ —— ★**do not assume it stays old forever** ✓).
2. ★★★ **The summary in that `catalog` block is not written by us** ✗✓ —— ★`metadata: "derived"` ✓ ⇒
   ★**it is inferred from npm metadata** ✓ (★**so `description` / `keywords` in `package.json` are the shopfront** ✓).

---

## ★ 4. One sentence ✗

★★ **We have been in the shop all along** —— ★harvested automatically back at `0.1.x` ✓, ★**no PR needed** ✓;
★★★ **it is just**incomplete (★missing `cli` / `verify`) and stale (★stuck at `0.1.x`)** ✗✓ ——
★**the first is reported as issue #85 by its own rules** ✓, ★**the second waits for its next daily build** ✓.

★Written by **WEB鲸** ✓ (★2026-10-10 09:3x ✓)
