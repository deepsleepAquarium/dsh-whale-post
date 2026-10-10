# Listing in the DSH plugin shop (SHOP) — **where we stand, and how to actually get listed**

> 中文: [SHOP.md](SHOP.md)
>
> **This file answers one question**: **"Are we in the DSH plugin marketplace, or not?"**
> **Answer: yes, and it is automatic — but incomplete and stale** (see below).

---

## 1. What that "marketplace" is (checked on 2026-10-10)

| Item | Value |
|---|---|
| **Name** | **`dsh-plugin-shop`** (`0.8.6` on npm) |
| **Its own description** | "The DeepSeek Harness plugin shop: browse, install, enable, and update dsh plugins from a **git-auditable catalog**" |
| **Repository** | `github.com/LivXue/dsh-plugin-shop` |
| **Who made it** | **a third party (LivXue)** — **not DeepSeek's own** (`@deepseek-ai/dsh` is the official CLI) |
| **How the catalog ships** | as another npm package, **`dsh-plugin-shop-catalog`** (containing `v1/plugins.<sha>.json`) |
| **How you get listed** | **you do not file a PR** — CONTRIBUTING, verbatim: "You do **not** contribute to this repository to get listed. The catalog **harvests by keyword**: add `dsh-plugin` or `deepseek-harness` to your `package.json` keywords" |

**And it rebuilds daily**: CONTRIBUTING says "…and publish to npm, and **the next daily build picks it up**" —
measured `index.json`: `builtAt: 2026-10-09T12:39:42Z` / `count: 14257` / `rejected: 17111`.

---

## 2. Where we actually stand (**re-measured 2026-10-10 17:1x** — **this revision is the correct one**)

I searched all **14329** entries (the build stamped `builtAt: 2026-10-10T07:30:15Z`) **package by package** — **the result**:

| package | in the catalog? | catalog version | latest on npm |
|---|---|---|---|
| `dsh-whale-post-bus` | **yes** | `0.4.0` | `0.4.0` |
| `dsh-whale-post-roster` | **yes** | `0.4.0` | `0.4.0` |
| `dsh-whale-post-types` | **yes** | `0.4.0` | `0.4.0` |
| `dsh-whale-post-deliver` | **yes** | `0.4.0` | `0.4.0` |
| `dsh-whale-post-gate` | **yes** | `0.4.0` | `0.4.0` |
| **`dsh-whale-post-verify`** | **yes** | `0.4.0` | `0.4.0` |
| **`dsh-whale-post-cli`** | **no** (**and that is correct**) | — | `0.4.0` |

**It answered at 2026-10-10 02:36Z, and both points landed**:
1. **`verify` was never rejected** — **it was created 10-09 17:07Z and first harvestable at 17:10Z**, **while the catalog I read was built at 12:39Z** ⇒ **a few hours apart** ⇒ **today's build picked it up**.
2. **And `cli` does have a rejection row — I was looking in the wrong place**:
   **rejections are published in `v1/report.md`**, **not in `denied.yml`** — the row reads:
   **`| dsh-whale-post-cli | no-bundle | Declares no dsh.bundle, so it is a library rather than an installable plugin. |`**
   ⇒ **the verdict is right**: **`cli` is a command-line entry point, not an installable plugin** ⇒ **not listing it is by design, not an omission**.
**⇒ I have replied to close the loop** (**and corrected my own "in neither the catalog nor any list"**).

---

## 3. Two things to keep in mind

1. **Versions move on their own — and this one has now been confirmed**: **the daily build harvests the latest on npm** ⇒
   **after the 2026-10-10 07:30Z build, all six plugins read `0.4.0`** (**and it happened by itself — we filed nothing**).
2. **The summary in that `catalog` block is not written by us** — `metadata: "derived"` ⇒
   **it is inferred from npm metadata** (**so `description` / `keywords` in `package.json` are the shopfront**).

---

## 4. One sentence

**We have been in the shop all along** — harvested automatically back at `0.1.x`, **no PR needed**;
**all six plugins are now listed and current** (`0.4.0`);
**and `cli` is absent because it is not an installable plugin** (`no-bundle`) — **which is correct**.

Written by **WEB鲸** (2026-10-10 09:3x)
