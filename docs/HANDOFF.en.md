# Handoff (HANDOFF) —— **carry on from "now"**

> 中文: [HANDOFF.md](HANDOFF.md)
>
> **Who this file is for**: **the next person to pick this up (or the next "me")** ——
> because **context gets compacted and sessions get reset** ⇒ **"I remember" does not survive**, **only what is written down does**.

---

## 1. Where things stand (early hours of 2026-10-11)

| Item | Value |
|---|---|
| **all seven on npm** | **`0.6.0`** (`bus` / `roster` / `types` / `deliver` / `gate` / `verify` / `cli`) |
| **tags** | **`v0.1.0` / `v0.2.0` / `v0.3.0` / `v0.4.0` / `v0.5.0` / `v0.5.1` / `v0.5.2` / `v0.5.3` / `v0.5.4` / `v0.6.0`** (**pin `v0.6.0`**) |
| **criteria** | **367** (`npm run selftest` **11 items**) |
| **tools** | `racetest`(11) / `xcheck`(6) / `doccheck`(5) / `pkgcheck`(17) / `compat`(5) / `check:imports` (scans 30 files) / `check:install` (7 steps, real install + boot) |
| **the pre-commit gate** | **install it first**: `npm run hooks:install` (local configuration —— **a fresh clone will not have it**); once installed, `git commit` runs `selftest` automatically, **bypassing requires an explicit `--no-verify`** |

**One command to confirm "nothing is broken right now"**:
```bash
node scripts/selftest-all.mjs && node scripts/racetest.mjs && node scripts/pkgcheck.mjs
```
**All green ⇒ safe to touch things**.

---

## 2. What to do next (split by "does it wait on someone")

### A. **Waits on nobody** (doable at any time)

* **Connect a real device** (the last step of **§3** in the original's 《跨设备邮局-1.0局域网实现清单》):
 install a WebDAV server + a share + a low-privilege account ⇒ point the remote root at a real address
 —— **a one-line config change** (`--remote` or `WHALE_POST_REMOTE_ROOT`).
 **The parts already exist**: `scripts/fake-phone.mjs` (five actions) + `send --remote` (deliver) + `pickup` (collect + mirror receipts).
* **Actually use `quiet`** (`hello --quiet 22:00-09:00` —— **the machinery is complete**: the `hello` envelope can
 carry `recv` (offline-only / can be woken), `onlineCapPerDay` (self-declared ceiling) and `quiet` (do-not-disturb
 window), and **`bus.hello()` accepts all three**; and **"who should declare it" already has an answer: the courier
 declares it itself** (design doc, appendix 3 —— the roster carries identity, `hello` carries habits),
 ⇒ **to actually use it, just fill those three fields in our own `hello`**).

**(The former item here, "add a reconciliation command for the ledger", was finished on 2026-10-11** ⇒ moved out
of "next steps": `whale-post reconcile --as <who> [--days N] [--remote <root>]` —— `gate` gained `recount()` and
the CLI gained `reconcile`; the ground rules and "**what can and cannot be recomputed**" are written in the
`reconcile` comments, and the usage is in `packages/cli/README` (both languages). **Letters sent to the remote
side are not on this machine** ⇒ by default only the local root is counted; pass `--remote` to include it.)

### B. **Waits on the keeper** (do not act on your own)

* **Three bounced letters on the NAS** (`\\DS423\whale-post\退信\` —— **untouched tonight**).
* **Registering "潮信鲸" in the roster** (item ④ of §4 of the original —— **the registration itself needs the keeper's nod**).
* **The daily cap number for online letters to a phone** (item ② of §4: suggested **3–5**).

### C. **Waits on other members** (cannot be done)

* **"Two-person review"** (the fourth item of §1 of the original —— **needs either qq or ghost**, **neither is in this session**).
* **About `issues`**: **issues and discussions are open here** (`has_issues: true`, `has_discussions: true`),
 with **number 1** sitting there as a welcome thread (it asks "what should the interface design / defaults /
 security model change?") —— **please open one**.
 **It was turned off once**: on 2026-10-05 the decision was "**public repositories keep issues/discussions
 turned off**"; on 2026-10-10 the keeper changed his mind ("**we need to take in what people say**"),
 so they were opened and that first one was filed.
 ⚠️ **Do not go looking for "the letter asking for an issue"** —— it **does not exist**:
 on 2026-10-10 I (WEB whale) assembled that task out of impressions, and **the truth is the opposite**
 (17 letters mention issues; **not one asks to open one**).

---

## 3. Read these before touching anything (the order is the reading order)

1. **`docs/FOR-AGENTS.md`** —— **sending discipline** (**the two tiers / how to send / what to do when refused**); **follow it**；
2. **`docs/RELEASE.md`** —— **follow its six steps to ship** ("six plugins first, then `cli`" **wrong order means it will not install**);
3. **"Read first (2)" in `CHANGELOG.md`** —— **the cross-version boundary** (ordinary letters interoperate; `0.2.0` and today's versions do not);
4. **`docs/ACCEPTANCE.md`** —— **what counts as "verified"** (**running the self-tests alone does not count; boot it once for real**).

---

## 4. The three easiest traps (every one of these really happened tonight)

1. **"I thought" does not count** —— **changed code ⇒ run it**; **added a criterion ⇒ check the count changed**; **changed docs ⇒ run `doccheck`**;
2. **`git reset --hard` takes away "everything uncommitted at that moment"** —— **commit the real work before making a probe commit**;
3. **a negative test must cut at the root** —— **disabling one branch while others remain** ⇒ "it did not go red" may just mean **you never reached it**.

---

## 5. Where tonight's books are

* **two more records live outside this repository** (an append-only operations log and a line-by-line self-check map) ——
 **they are not in this repo**, so **no paths are given here**;
* **`git log`** —— **the messages say "why"** (not "which line changed").

Written by **WEB鲸** (2026-10-10 08:3x)
