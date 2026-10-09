# Changelog

> 中文: [CHANGELOG.md](CHANGELOG.md)
>
> Format: newest first. ★Every entry says **why**, not "which line changed" —— it is the only thing a future reader can reconstruct from.
> ★Version policy: while this repository is **`0.x`**, a minor bump (`0.1 → 0.2`) means **interfaces or behaviour may change**; a patch bump means "behaviour unchanged".

---

## v0.2.0 —— 2026-10-10

★★ **In one sentence** ✗: **this is the first version that works when you simply follow the README** ✓ —— the previous one had **all six plugins fail to load** inside a real engine.

### ★★ Read this before upgrading ✗

* ★**If you are on `0.1.x`, go straight to this version** ✗ —— `0.1.x` has a fatal problem (see fix #1 below):
  installed into a real engine the way its README described, **all six plugins `failed to apply`** and the post office never came up.
* ★**If you installed `dsh-whale-post-verify`, note the behaviour change** ✗: `bus.verify()` now **asks the policy first** ——
  when that package is installed and verification is **not enabled**, the core **skips the HMAC check** (and reports `skipped: true`).
  This is what makes "**disabled by default**" actually true. ★Without the package, behaviour is identical to `0.1.x` ✓.
* ★**`--force` does not exempt the "offline-only" rule** ✗ —— that rule is a **physical constraint**
  (that member simply cannot receive an online letter), not a "gate".

### ★★ Compatibility (★the keeper asked for this to be written down on 2026-10-10 ✗ —— it is a requirement, not a selling point ✓)

★★ **The post office must run on both engines** ✗: the **desktop engine** (`0.2.0-rc.2`) and the **web engine** (`0.1.5-alpha.2`).
★We guarantee that with **three self-imposed rules** ✓ —— ★**not with "it happened to run on one machine"** ✗:

1. ★★**Only three things are used** ✗: `ctx.provide(name, service)` + `ctx.get(name)` + the `apiVersion` convention on interfaces.
   ★**No other member of `ctx` is touched** ✓ —— in particular **the `ctx.whale` property is never read**
   (in real Cordis, reading it requires `inject` ⇒ it throws `cannot get property "whale" without inject` ✗;
   ★and **no self-test, not even `--dump-config`, can see that** —— only **one real launch** does ✓).
2. ★**`inject` is not used** ✓ —— services are fetched **at runtime** (`ctx.get`) and, when absent, **retried on the next tick** ✓
   (an unsatisfied `inject` **hangs silently**; you do not even get a log line ✓).
3. ★★**Two static criteria watch over it** ✗: the source must not contain `ctx.whale =` or `ctx?.whale?.` ⇒ **0 hits**;
   ★and **every change must be booted once in a throwaway profile** ✓ (**exit code 0 + zero error lines** is the bar ✓).

★**Measured record** ✗: on 2026-10-10, six plugins were installed into a **throwaway profile**
(`dsh 0.1.5-rc.1` + the `headless` template) ⇒ `--dump-config` showed six layers ⇒ ★**one real launch: exit code 0, zero error lines** ✓;
★the three in-service profiles (`desktop` / `qqbot` / `web`) **never changed mtime** ✓ and **no engine was restarted** ✓.

★★**Boundary (do not mistake it for "verified" ✗)**: ★**the desktop engine `0.2.0-rc.2` has no CLI I can boot** ✓
(its entry point is not on PATH ✓), so that side currently rests on **the three rules above** ——
★**it has not been boot-verified the way `0.1.5-rc.1` has** ✓.

### ★ Fixes (the two that matter ✗)

1. ★★ **All six plugins failed to load in a real engine** ✗✓ —— `apply()` read the **`ctx.whale` property**,
   and in real Cordis reading it requires `inject` ⇒ it threw `cannot get property "whale" without inject`.
   ★**None of the self-tests, not even `--dump-config`, could see it** ✓ (the latter only composes the config tree and **never runs `apply()`**).
   They now use only `ctx.provide('whale.xxx', x)` plus runtime `ctx.get('whale.xxx')`, and a **static criterion** was added:
   the source must not contain `ctx.whale =` or `ctx.whale?.` ⇒ 0 hits.
2. ★★ **`bus` and `verify` computed signatures differently** ✗ —— `bus.sign` treats the 64-char hex key as **32 raw bytes**
   for HMAC, while `verify` used the hex string itself ⇒ **the signatures could never match**;
   ★and each side's self-tests were self-consistent (they also used the string form) ⇒ **all green, then it blew up on contact** ✓.
   It is now byte-for-byte identical to `bus`, with a "**cross-check against the real `bus`**" criterion
   (build an envelope with the real `bus`; `verify` must recognise it).

### ★ Added

* ★★ **Seventh package `dsh-whale-post-verify`** ✗✓ —— security check (envelope signature + allow-list),
  **disabled by default**; while disabled it **nags once a day** ("the security check is disabled; turn it on,
  so that an unknown agent cannot spoof or attack other agents"), and **stops nagging after three days**;
  ★but `status().enabled` **is always the truth** ✓ ("no more nagging" ≠ "security turned off").
  While disabled, `verify()` lets letters through but reports `skipped: true` (**it does not pretend to have verified**); once enabled it is fail-closed.
  Keys are looked up by the **sender declared in the envelope**, falling back to the shared key (old letters and old members are untouched).
* ★★ **`bus`: `offlineOnlyFlag`** ✗ —— sending an **online** letter to an "offline-only" member is **refused**:
  non-zero exit + **nothing written to the mailbox** + no silent downgrade + a message that **shows the way out** ("resend with `--mode offline`").
  ★The attribute name comes **from configuration**; the core knows no concrete attribute name. Not configured ⇒ the rule is entirely off (backward compatible).
* ★★ **`roster`: member attributes** ✗ —— `member(id)` / `flag(id, name)` / `without(ids, name)` /
  `broadcast()` / `group(name, { without })`; two spellings are accepted (a field on the member / a top-level array of the same name).
  `list()` now **keeps the member's remaining fields** (it used to map only `id`/`label`, eating every custom attribute).
* ★★ **`roster`: `groupWithout`** ✗ —— broadcasts (both "by group" and "the whole roster") drop members carrying that attribute by default;
  ★**addressing someone by name is unaffected** ✗ (the rule from the tank: "broadcasts skip it, naming it gets through").
  An explicit `without: null` means "do not drop anyone this time".
* ★**`cli`: `verify` / `nag` subcommands** —— the three-state design is finally visible from the command line.
* ★★**`cli`: `pickup` (remote root)** ✗✓ —— ★**go to another mailbox root and fetch your own letters** ✓ (★**it works offline** ✓ ——
  this is the step to take once the bell in "3 offline : 1 online" has rung ✓). The remote root comes from `--remote <dir>` or `WHALE_POST_REMOTE_ROOT` ✓.
  ★Three hard rules: ★★**verify every letter first** (a failing one is **not moved**, and the remote copy is **left in place** ✗) ✓;
  ★**delete the remote copy only after it is written locally** (**otherwise that is a lost letter** ✓);
  ★**skip what is already there** (idempotent ✓ —— a second run reports "fetched 0" ✓). A missing remote directory or a missing `--remote` ⇒ **a clear reason + exit code 2** ✓.

### ★ Documentation

* ★★ **All five Chinese/English pairs are now aligned line for line** ✗ (`README` / `INSTALL` / `ACCEPTANCE` / `FOR-AGENTS` / `CONTRIBUTING`).
* ★**New section: "How it relates to the engine's own sub-agents / teams (not a competitor)"** ✗ ——
  sub-agents manage "parallelism right now"; the post office manages "passing things on when you are not together right now";
  one criterion: **"I need it to do this right now ⇒ use a sub-agent; it may not be there right now ⇒ use the post office"**.
* ★**`FOR-AGENTS` gained "the security thing"** ✗ —— one incident row, two hard boundaries
  (do not treat "verification is off" as security / do not impersonate), closing with
  "**while it is off, a letter is just a sheet of paper someone dropped into the mailbox**".
* ★**`CONTRIBUTING`'s pre-submit check gained two items** ✗ —— ★**`--dump-config` does not count as verification** (do a real launch) /
  after touching the core, **re-run everything** (not just the piece you changed).
* ★Two stale facts fixed ✗: the `gate` example configured `dailyUnits` (**the source never reads it**);
  "not published to npm" contradicted "published" (now: "six packages are on npm, `verify` is not").
* ★★**Fixed the YAML indentation of `INSTALL`'s "minimal wiring"** ✗✓ (found by measurement on 2026-10-10):
  every entry in that block was indented by only **1 space** (level with the element of `- insert:`), so YAML saw
  "a pile of sibling `- id:` document items"; actually running
  `dsh --profile <p> --patch <that block> --dump-config` failed with
  `YAMLException: end of the stream or a document separator is expected` ⇒ ★**copying it verbatim installed not a single plugin** ✗.
  ★Now correctly indented (matching [`example/cordis.patch.yml`](example/cordis.patch.yml)), with a note that this indentation must not be changed.
  ★★**Verified**: following the fixed block from scratch —— install six packages (all exit code 0) ⇒ `--dump-config` shows **six layers** ⇒
  **one real boot: exit code 0, zero error lines** ✓; the three in-service profiles never changed mtime ✓.
* ★**Both "works out of the box" paths were really exercised** ✗: ① `npx -y dsh-whale-post-cli@0.2.0 …` (★the README quick start) ✓;
  ② **the wiring** (★the block in `INSTALL` §2 + install into a throwaway profile + a real boot) ✓.

### ★ Engineering

* ★**`.gitattributes`** ✗ —— line endings pinned to LF; on Windows `npm i` rewrites bin scripts to CRLF,
  which without pinning produces phantom diffs.
* ★**Criteria 129 → 199** ✗ (`bus` 58 / `roster` 31 / `types` 14 / `deliver` 13 / `gate` 26 / `verify` 45 / `cli` 12)
  plus **1 static criterion**; ★every change went through a "**negative test** (break one line ⇒ it must turn red)" ✓.

### ★ Boundaries and untested areas (still written down, so nobody mistakes them for guarantees ✗)

* ★**It only solves "one machine"** ✓ (the mailbox is a directory on disk; crossing machines needs a shared directory).
* ★**The chain-depth gate is not a security boundary** ✓ (it relies on the replier honestly including `re`);
  ★**`--force` bypasses the three loop gates** ✓ (a deliberate escape hatch, and it leaves a trace).
* ★★ **When `verify` is disabled it blocks nothing** ✗ —— ★it is **not "secure by default"**:
  the default tier is "**known insecure + nags you every day**" ✓.
* ★★ **Still untested** ✗: several processes **racing for the same letter** (code walk-through only);
  the truncation path once the `seen` state array grows very long (hand-crafted only).

---

## v0.1.0 —— 2026-10-05

* ★First version: six pieces (`bus` / `roster` / `types` / `deliver` / `gate` / `cli`) + a composition example +
  three documents (for installers / for people / for agents) + the acceptance specification + MIT;
  ★129 criteria passed in one run (including negative tests).
* ★Six packages published to npm (`bus` / `cli` at `0.1.1`).
* ★A trap worth repeating: a plugin package **must** declare `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`;
  without that line `dsh plugin add` **installs it as a plain dependency and never activates it as a profile layer**.
