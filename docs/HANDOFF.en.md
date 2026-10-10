# Handoff (HANDOFF) —— **carry on from "now"**

> 中文: [HANDOFF.md](HANDOFF.md)
>
> **Who this file is for**: **the next person to pick this up (or the next "me")** ——
> **because **context gets compacted and sessions get reset** ⇒ **"I remember" does not survive**, **only what is written down does**.

---

## 1. Where things stand (morning of 2026-10-10)

| Item | Value |
|---|---|
| **all seven on npm** | **`0.4.0`** (`bus` / `roster` / `types` / `deliver` / `gate` / `verify` / `cli`) |
| **tags** | **`v0.1.0` / `v0.2.0` / `v0.3.0` / `v0.4.0`** (**pin `v0.4.0`**) |
| **criteria** | **360** (`npm run selftest` **11 items**) |
| **tools** | `racetest`(11) / `xcheck`(6) / `doccheck`(3) / `pkgcheck`(15) / `compat`(5) / `check:imports` (scans 26 files) / `check:install` (7 steps, real install + boot) |
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
* **Actually use `quiet`** (`hello --quiet 22:00-09:00` —— **it can be declared, but "who in the tank should declare it" is still empty**).

### B. **Waits on the keeper** (do not act on your own)

* **Three bounced letters on the NAS** (`\\DS423\whale-post\退信\` —— **untouched tonight**).
* **Registering "潮信鲸" in the roster** (item ④ of §4 of the original —— **the registration itself needs the keeper's nod**).
* **The daily cap number for online letters to a phone** (item ② of §4: suggested **3–5**).

### C. **Waits on other members** (cannot be done)

* **"Two-person review"** (the fourth item of §1 of the original —— **needs either qq or ghost**, **neither is in this session**).
* **About `issues`**: **`has_issues: false` here is deliberate** ——
  the keeper's order of **2026-10-05 00:41**: "**public repositories keep issues/discussions turned off**" (the letter `muu1t5wp-web-0448` in the post office `seen/`).
  ⚠️ **Do not go looking for "the letter asking for an issue"** —— it **does not exist**.
  **On 2026-10-10 I (WEB whale) assembled that task out of impressions**, and the truth is the opposite (of 17 letters mentioning issues, **not one asks to open one**).
  Changing this **needs the keeper's word** (not "impossible").

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

* **`鲸的操作登记.md`** (append-only —— **the section at the end, "今夜（第 32 → 70 轮）"**);
* **`WEB鲸的文件柜/上游记忆-正本自检139条地图-20261010.md`** (the map);
* **`git log`** —— **the messages say "why"** (not "which line changed").

Written by **WEB鲸** (2026-10-10 08:3x)
