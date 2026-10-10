# Changelog

> 中文: [CHANGELOG.md](CHANGELOG.md)
>
> Format: newest first. Every entry says **why**, not "which line changed" —— it is the only thing a future reader can reconstruct from.
> Version policy: while this repository is **`0.x`**, a minor bump (`0.1 → 0.2`) means **interfaces or behaviour may change**; a patch bump means "behaviour unchanged".

---

## v0.6.1 —— 2026-10-11 (**released**)

> **Removing a sentence from the first line of `--help` that had stopped being true.**

### **Why this release exists**

The first line of `--help` used to say "six packages are on npm … (the seventh, `verify`, is in-repo, not yet published)".

That was true while `verify` had not been published — but it was published later (from `0.5.0` on), **and nobody
went back to change the sentence**. So the first line every newcomer sees after
`npx -y dsh-whale-post-cli --help` was a false statement — and that line is the one they are most likely to read.

**How it was found**: an end-to-end check that installs from npm and runs the CLI; reading the first line of `--help`
showed it was wrong. **The same class was checked too**: all 27 published artifacts (the `files` of the seven packages)
were `git grep`-ed for `待发` / `未发` / `尚未发布` / `not yet published` — nothing else turned up.

### **What changed**

* First line of `packages/cli/index.js`'s `--help`: **all seven are on npm** (no more "the Nth one");
* the 40 version mentions (`README`, `INSTALL`, `HANDOFF`, `FOR-AGENTS`, the `cli` `README`) moved to `0.6.1`;
  the tag list in `HANDOFF` was regenerated (**11 tags**, including `v0.6.1`).

### **Which number this is, and why**

**Text only, no behaviour change** (help text is not an interface) ⇒ by this repository's policy the **last number**
moves: `0.6.0` → `0.6.1`. The **middle number stays** — no new interface, no behaviour change.

---

## v0.6.0 —— 2026-10-11 (**released**)

> **Re-issuing the previous batch under the correct number.**

### **Why this release exists**

The previous version added `gate`'s public interface `recount` and `cli`'s `reconcile` command ——
**both the interface and the behaviour changed**, so this repository's own policy (`CONTRIBUTING` section 1:
**an interface or behaviour change moves the middle number**) called for the **middle** number, and only the
**last** number moved instead. **The harm was real**: anyone whose dependency range used the caret silently
picked up a behaviour change —— and keeping "**may change**" apart from "**will not change**" is exactly what
the middle number is for.

So this release does two things: **it corrects the number**, and it moves that rule **to the step where the
decision is made** (the release checklist gained a section before step 0: "decide the version number first").
The rule was already written down in two places; the problem was not that it was missing, but that it was not
consulted at the moment the number was chosen.

### **What is in this release**

* `gate`'s `recount()` and `cli`'s `reconcile` command (**reconciliation**: recompute a ledger from the
 filesystem and compare it per day and per bucket; **match ⇒ exit 0; difference ⇒ exit 3**; the
 recomputation runs on **the same production line as bookkeeping**, so drift is structurally impossible);
* `gate`'s README: a new "Reconciliation" section, and its closing line fixed from "those three" to "those
 four" (it was wrong on the npm page);
* the "decide the version number first" section in the release checklist.

Criteria stay at 367.
## v0.5.4 —— 2026-10-11 (**released**)

> **Fixing a wrong sentence printed on the npm page: `gate` does not have one exit, or three — it has four.**

### **What was wrong**

`gate`'s README ended with "the core and the other plugins only recognise those three: `check` / `record` /
`report`". After `0.5.3` added `recount` (the recomputation behind reconciliation) that sentence stopped being
true —— and it sits on the npm page for `gate`, **where anyone who installs it can read it**.

### **The fix**

* That sentence now says "**those four**", matching the code;
* The README **gains a "Reconciliation" section in both languages**: the command lives in `cli`
 (`whale-post reconcile --as <who> …`), **match ⇒ exit 0; difference ⇒ exit 3**, and **what it can and
 cannot recompute** (the ones it cannot —— `forced` / `over` / `feeCent` / `byPhone` / `recent` —— are
 listed honestly by the command itself);
* The interface list in `index.js`'s header comment also gains `recount` —— that list is the "public surface",
 and leaving it out would make the next person think there are only three exits;
* Documentation and comments only, **no behaviour changed** ⇒ patch number. Criteria stay at 367.
## v0.5.3 —— 2026-10-11 (**released**)

> **The ledger gained a reconciliation command: recompute a ledger from the filesystem.**

### **Why it exists**

Item five of the S6h hardening list (design doc, appendix 2) has two halves: "**the count may be low,
never high**" (done long ago: the ledger is "a base file + increment files", so a crash may under-count
and it **never double-counts**) and "**a reconciliation command**" (missing until now). Without a
recomputation the ledger can only be **believed, never verified** —— which the design doc calls
"the foundation of 'the ledger is optional'".

### **One deliberate decision: do not write a second recount**

In `gate`, "one letter becomes one increment" was extracted into `incrementFor`, and "merge an increment
into the per-day ledger" into `mergeIncrement`, so `record` (bookkeeping), `report` (reading) and
`recount` (recomputation) run on **the same production line** —— drift between "recompute" and "record"
is therefore **structurally** impossible, rather than prevented by a comment.

### **What you will see**

* `whale-post reconcile --as <who> [--days N] [--remote <root>]`: compares **per day, per bucket**,
 **match ⇒ exit 0; difference ⇒ exit 3**;
* **A "not compared" line**: `forced` / `over` / `feeCent` / `byPhone` / `recent` **cannot be
 recomputed** (`force` is a choice made at send time and leaves no trace in the letter; `over` and
 `feeCent` depend on the usage read at bookkeeping time) —— better to say "not compared" than to hand
 out a number that looks like "it matches";
* **Letters sent to the remote side are not on this machine** ⇒ by default only the local root is
 counted; pass `--remote` to include it.

### **Criteria**

Two, both actually run: right after sending ⇒ matches (exit 0); **deliberately delete one letter from
`seen/` ⇒ it must report a difference** (exit 3). The second one is the point —— it proves the recount
**really reads the files**; otherwise "print the ledger back" would satisfy the first one too.
Criteria 365 → **367**.
## v0.5.2 —— 2026-10-11 (**released**)

> **Fixing one wrong sentence that was sitting on the npm page.**

### **What was wrong**

The `cli` English page said "the latest on npm is now `0.4.0`" —— while npm already had `0.5.1`.
That file was written at 23:29 by the step that added the English twins, and the version-number list
used for the `0.5.0` / `0.5.1` releases had been written earlier: **it listed `packages/cli/README.md`
but not its English twin**, so the twin was missed.

### **The fix**

* The version claim in that English page now reads `0.5.2` (matching the Chinese side);
* **and the English twin is now part of the release checklist**, so this cannot repeat;
* documentation only, **no behaviour changed** ⇒ patch number.
## v0.5.1 —— 2026-10-11 (**released**)

> **One line of change: make the English version reachable from the npm page.**

### **Why this deserved its own release**

`0.5.0` gave the eight Chinese-only documents an English twin. Then, right after publishing:
`npm view` still returns the **Chinese** readme —— because the npm page renders `README.md`,
so `README.en.md` rides along in the tarball but **readers cannot reach it from the npm page**.

So each of the seven packages published to npm (six plugins + `cli`) gains one line: the Chinese
page links to the English version on GitHub, and the English page links back. Absolute URLs,
because the npm page cannot resolve repository-relative links.

* Documentation only, **no behaviour changed** ⇒ patch number;
* one extra link on each side ⇒ the structure stays item-by-item equal (`doccheck` 5/5).
## v0.5.0 —— 2026-10-10 (**released**)

> **Two things: `quiet` got its other half (the receiving side), and the decorative marks are gone from the output text.**

### **Behaviour changed: inside a quiet window, the mailbox does not process its own mail either**

**The bug**: `quiet` used to work only on the `send` side ("do not wake me when someone sends an
online letter") —— while the **receiving side** (`pump` consuming letters and handing them to a
reader) **never looked at it** ⇒ **"do not disturb" was only half there**: nobody woke me, but when
I woke up myself I read everything anyway.

**The fix**: if you declared `quiet` and we are inside that window ⇒ **keep it, even when a reader is
present**. Same reason as `keep`: **the letter stays in the mailbox** ("a letter only arrives late,
never not at all"); and **"do not disturb" means "not even I process it right now"**.

* **`keep: false` still wins** —— an explicit "I want to read now" decides;
* **it is not a refusal** —— just "not this round"; once the window passes, `pump` reads as usual;
* the four kinds of "keep it" now **each state their own reason** (`keep: true` / quiet window /
 the `keep` function says keep / there really is no reader) —— the first version filed the quiet
 case under "no reader", while there **was** a reader ⇒ the stated reason did not match the facts.

### **Text only: no more decorative marks in the output**

Command output (refusal reasons, hints, the notes in `--help`) used to carry marks like `` `` ``,
plus internal-only words. They are all gone now.

**Why this deserves its own entry**: this is text **printed for users**. And changing it **does not
change behaviour** —— every string literal in the code was compared byte for byte before and after.

### **Criteria and documentation**

* Criteria **353 → 360** — seven were added after v0.4.0: **the truncation path moved from untested to tested** / **"which npm version the docs state"** / **quiet-window behaviour** / **documented defaults match the code's `DEFAULTS`** / **the version has a CHANGELOG section** / **every flag our own documented commands use exists in the code** / **no broken relative links**;
* the sample numbers in the combination example and in `gate`’s field table are now aligned
 with the code defaults (`gate`'s four buckets: 120 / 45 / 60 / 80);
* `packages/*/description` gained one English line (the first thing an English reader sees in npm search).

## v0.4.0 —— 2026-10-10 (**released** —— all seven are on npm)

> **This version contains exactly one thing, and it is the half that was missing from the plan**: **the "deliver" half of S6**.

### Added: delivering to a remote member (the "deliver" half of S6)

**The original's words** (《跨设备邮局-1.0局域网实现清单》§1 · S6):
"**deliver**: a letter to the phone ⇒ write the remote `inbox/潮信鲸/` (**keep no second copy locally**)"

**The illness**: `pickup` (the **receive** half) had been done long ago, while **`send` only ever wrote the local `inbox/`**
⇒ **"delivering to the phone" was not implemented at all in the public repository** —— **and the checklist counts it as half of S6**.
**How it was found**: in round 67 I was writing the "fake phone" script from §3 of that checklist, **and the step "the tank delivers ⇒ the fake phone receives" did not work**.

* **`send --remote <mailbox root> --remote-only <attribute>`** —— members carrying that attribute ⇒ **write remote + delete local**
 (**write remote first, then delete local**: a crash midway leaves the local copy in place ⇒ **"a letter may arrive late, never not at all"**);
 **without `--remote-only` ⇒ still local as before** (**old behaviour unchanged**).
* **"No second copy locally" is not tidiness**: **keeping one creates two authorities** ⇒ and the two will **disagree** about fetching, receipts and consumption.

### Added: `scripts/fake-phone.mjs` (the "fake phone")

The original's §3: "write a **fake phone** script (using `node` to read and write the 'simulated mailbox' directory directly,
performing the phone's **five actions**: `PUT hello` / `PROPFIND≈list` / `GET` / `MOVE⇒seen` / `PUT ack`)
⇒ **an end-to-end run** (the tank delivers ⇒ the fake phone receives ⇒ the fake phone replies ⇒ the tank collects)"

* **The five actions are performed literally** —— **both the hello and the ack are genuinely signed** (through `bus.seal` ⇒ **the tank verifies them**),
 **not "pretend"**; **MOVE is also "write first, delete after"** (a crash midway leaves the mailbox copy in place).
* **The end-to-end run genuinely works**: the tank's `send --remote` ⇒ mailbox `inbox` **1** / local **0** ⇒
 the fake phone `--drain` ⇒ `GET` + `MOVE ⇒ seen` + `PUT ack` ⇒ mailbox `inbox` **0** / `seen` **1** / `ack/web` **1** ⇒
 the tank's `pickup` ⇒ **1 receipt mirrored** ⇒ local `ack/web` **1** —— **closed loop**.
 **And before this, "the end-to-end run works" was only an**inference**** —— **now it is a demonstration**.

### Criteria and boundaries

* `cli` 52 → **54** (a remote member ⇒ written remotely and zero copies locally / without `--remote-only` ⇒ **still local**); **353 criteria** in all.
* **Still not done**: **connecting a real device** (WebDAV + a share + pointing the remote root at a real address) —— **that needs those five words from the keeper**
 (§4 of the original); the fake phone in this version is **played by a local directory**, **not a real phone**.
* **Measured: the two published versions run against each other** (when releasing `0.4.0`, 2026-10-10):
 · `0.3.0` sends ⇒ `0.4.0` receives: **works**;
 · `0.4.0` sends ⇒ `0.3.0` receives: **also works** —— **ordinary letters are interoperable**.
 **Why**: `recv` / `quiet` are **optional fields** (without a declaration they **never enter the envelope**),
 and `0.3.0` **already contained them** (they were committed in rounds 60 / 61, and the tag was made afterwards).
 ⚠️ **My first version said "a letter sent by `0.4.0` bounces on `0.3.0`"** —— **and the measurement says it works**.
 **That was a conclusion written without verifying it** —— exactly the shape I kept tripping over tonight.
 But **receipts** (which carry `peerStateAtSend`) **do bounce** on the old version —— **that one still holds** (see "Read first (2)").

## v0.3.0 —— 2026-10-10 (**released** —— all seven are on npm)

> **Why this section stands on its own**: we did a dozen more rounds after `0.2.0` shipped ——
> and **the `v0.2.0` section below mixes "already released" with "added afterwards"**
> (it had 22 entries at release time and has 45 now).
> So this section states **what this version actually changes**; below it, **entries marked with extra emphasis are the new ones**.

### Read first: **three behaviour changes** relative to `v0.2.0`

**All three turn a refusal into "send it anyway + say so loudly"** —— **if you depend on the old behaviour, read this before upgrading**:

| Before | Now | Why |
|---|---|---|
| **no handshake ⇒ throw and refuse** | **send anyway + say plainly "downgraded to offline for them"** (`wakePrediction.willWait`) | Verbatim from the original: "**if you cannot wake them, leave it in the box for them —— but say so loudly**" —— and "refusing" is **backwards**: **the letter never leaves**, yet the sender believes "the protocol forbids it" |
| **offline letters went through all three loop gates** | **offline letters are exempt from the whole loop gate** (quotas unchanged) | Those gates stop "**waking the other side one extra time**", and **an offline letter wakes nobody** ⇒ blocking it **buys nothing** |
| **an online letter to an "offline-only" member ⇒ refused** | **send anyway + say "treated as offline for them"** (**`mode` in the envelope is untouched** —— it sits inside the signature domain) | Same reasoning |

**All three keep a way back**: `requireHello: 'reject'` / `offlineOnlyMode: 'reject'` ⇒ **an old deployment writing those sees no change at all**.

### Read first (2): **across mixed versions, receipts are bounced by the old side** —— **the one thing to know during an upgrade**

**One thing to state plainly first** (corrected by measurement on 2026-10-10): **ordinary letters are interoperable**.
From `0.3.0` onwards both sides have the **same signature domain** (`recv` / `quiet` / `peerStateAtSend` are all present)
⇒ `0.3.0` sends ⇒ `0.4.0` receives: **works**; `0.4.0` sends ⇒ `0.3.0` receives: **also works**.
**What does not work is the earlier step**: between `0.2.0` and today's versions the **signature domain differs by 7 fields**
⇒ **letters (and receipts) sent by a new version are bounced by `0.2.0`** (it reports "a field **not in the signature domain**").

**Measured** (2026-10-10, running `npx …@0.2.0` against the checkout):

| Direction | Result |
|---|---|
| **`0.2.0` sends ⇒ `0.3.0` receives** | **works** (an old envelope still verifies —— canonical includes only fields that are **present**) |
| **`0.3.0` sends ⇒ `0.2.0` receives** | **bounced** —— the old version reports: "a field **not in the signature domain**: `peerStateAtSend`" |

**Why**: this version added 7 fields to the **signature domain** —— **and "no unregistered fields" is the**old version's** fail-closed rule**
⇒ **of course it does not recognise the new fields**.
**It cannot be fixed**: **the old version is already published** ⇒ **know about it and plan the upgrade around it**:
**upgrade both sides to `0.3.0` (or later) first, then start sending**; **while versions are mixed, letters sent by `0.3.0` do not reach the old side**.
(This is also the field answer to "**why signature-domain fields cannot be added casually**" —— add one field, **and you add one one-way wall**.)

### Two real bugs (the kind you only see by running it)

* **The quota ledger loses entries under concurrency** —— 12 real sub-processes each writing one entry left only **8 / 9 / 10** in the ledger
 (and "**the quota is someone else's money**", with **no fallback at all**) ⇒ now **each entry is its own increment file**
 ("**each writes its own**" —— **the very cure the original used for `ack`**). Old ledgers **are still read**.
* **The watermark could go backwards** —— under 12-way concurrency, **the last process to write may be the one that claimed its sequence first** ⇒ it wrote a **smaller** `n`
 ⇒ now it is **monotonic** (the worst case moves from "wrote too small" to "wrote one time fewer" —— and a missed write is fixed by the next send).

### Other additions (the per-entry list is below, marked with extra emphasis)

* **Structured acknowledgements**: one receipt states **two things** (`recipientState` + `disposition`),
 **and `disposition` prefers the delivery note written by the sender** (`deliveryNote` **travels with the letter**).
* **S11: dormant ⇒ bounce** plus **`dormant --pin`** (promoting an **inferred** dormancy into a **declared** one ——
 "**an inferred dormancy never bounces automatically**": otherwise "bounce ⇒ the evidence disappears ⇒ judged active again" **oscillates**).
* **S6h's three hard jobs**: a half-written `.tmp` ⇒ `垃圾/` (**never delete**) / **a fetched letter keeps its original mtime** /
 **a future timestamp is judged stale** (fail-safe: **a misjudgement may only lean towards offline**).
* **S8: the daily cap on online letters to a "phone"** (the allowance is `min(self-declared, ceiling)` —— **a declaration can only be more conservative**).
* **S12: do not hang when the link drops** (probe before touching the mailbox —— measured: **22.7 s** down to **2.8 s**).
* **Four tools**: `racetest` (11 criteria) / `xcheck` (cross-package, 6) / `doccheck` (CN/EN doc parity, 3) /
 `pkgcheck` (package metadata, 11) —— **all wired into `npm run selftest`** (**10 items** now).
* **Criteria 199 → 339**.

## v0.2.0 —— 2026-10-10

**In one sentence**: **this is the first version that works when you simply follow the README** —— the previous one had **all six plugins fail to load** inside a real engine.

### Read this before upgrading

* **If you are on `0.1.x`, go straight to this version** —— `0.1.x` has a fatal problem (see fix #1 below):
 installed into a real engine the way its README described, **all six plugins `failed to apply`** and the post office never came up.
* **If you installed `dsh-whale-post-verify`, note the behaviour change**: `bus.verify()` now **asks the policy first** ——
 when that package is installed and verification is **not enabled**, the core **skips the HMAC check** (and reports `skipped: true`).
 This is what makes "**disabled by default**" actually true. Without the package, behaviour is identical to `0.1.x`.
* **`--force` does not exempt the "offline-only" rule** —— that rule is a **physical constraint**
 (that member simply cannot receive an online letter), not a "gate".

### Compatibility (the keeper asked for this to be written down on 2026-10-10 —— it is a requirement, not a selling point)

**The post office must run on both engines**: the **desktop engine** (`0.2.0-rc.2`) and the **web engine** (`0.1.5-alpha.2`).
We guarantee that with **three self-imposed rules** —— **not with "it happened to run on one machine"**:

1. **Only three things are used**: `ctx.provide(name, service)` + `ctx.get(name)` + the `apiVersion` convention on interfaces.
 **No other member of `ctx` is touched** —— in particular **the `ctx.whale` property is never read**
 (in real Cordis, reading it requires `inject` ⇒ it throws `cannot get property "whale" without inject`;
 and **no self-test, not even `--dump-config`, can see that** —— only **one real launch** does).
2. **`inject` is not used** —— services are fetched **at runtime** (`ctx.get`) and, when absent, **retried on the next tick**
 (an unsatisfied `inject` **hangs silently**; you do not even get a log line).
3. **Two static criteria watch over it**: the source must not contain `ctx.whale =` or `ctx?.whale?.` ⇒ **0 hits**;
 and **every change must be booted once in a throwaway profile** (**exit code 0 + zero error lines** is the bar).

**Measured record**: on 2026-10-10, six plugins were installed into a **throwaway profile**
(`dsh 0.1.5-rc.1` + the `headless` template) ⇒ `--dump-config` showed six layers ⇒ **one real launch: exit code 0, zero error lines**;
the three in-service profiles (`desktop` / `qqbot` / `web`) **never changed mtime** and **no engine was restarted**.

**Boundary (do not mistake it for "verified")**: **the desktop engine `0.2.0-rc.2` has no CLI I can boot**
(its entry point is not on PATH), so that side currently rests on **the three rules above** ——
**it has not been boot-verified the way `0.1.5-rc.1` has**.

### Fixes (three —— the third was found on 2026-10-10 in **real letters inside the shared post-office root**)

1. **All six plugins failed to load in a real engine** —— `apply()` read the **`ctx.whale` property**,
 and in real Cordis reading it requires `inject` ⇒ it threw `cannot get property "whale" without inject`.
 **None of the self-tests, not even `--dump-config`, could see it** (the latter only composes the config tree and **never runs `apply()`**).
 They now use only `ctx.provide('whale.xxx', x)` plus runtime `ctx.get('whale.xxx')`, and a **static criterion** was added:
 the source must not contain `ctx.whale =` or `ctx.whale?.` ⇒ 0 hits.
2. **`bus` and `verify` computed signatures differently** —— `bus.sign` treats the 64-char hex key as **32 raw bytes**
 for HMAC, while `verify` used the hex string itself ⇒ **the signatures could never match**;
 and each side's self-tests were self-consistent (they also used the string form) ⇒ **all green, then it blew up on contact**.
 It is now byte-for-byte identical to `bus`, with a "**cross-check against the real `bus`**" criterion
 (build an envelope with the real `bus`; `verify` must recognise it).
3. **Letters from the transition period carrying `auth` could not be received** —— **this was found in real letters inside the shared post-office root**:
 the tank's engine **really did write `auth` into envelopes** during a transition (its later decision was "bucket by `mode`, not by `auth` ⇒ the envelope format is unchanged"),
 while our `verify()` treats any field **outside the signature domain** as a bounce ⇒ **those letters could not be received at all**.
 **Evidence**: the shared root's `inbox/web` held **three** letters addressed to this whale (`潮信鲸`'s "formal check-in" ×2 plus
 "**material: the DSHA porting issue collection (six items, with DNS-poisoning evidence)**") —— all three **were bounced into `退信/` by our implementation**.
 ⇒ `LEGACY_FIELDS = ['auth']` was added: **old letters pass (treated as history), new letters stay fail-closed**
 (`seal()` **still rejects `auth`** ⇒ it must never appear in a new letter again; any other unknown field is still rejected).
 After the fix, **that "material" letter really was read** —— that is what the word "compatibility" means in practice.

### Added

* **Seventh package `dsh-whale-post-verify`** —— security check (envelope signature + allow-list),
 **disabled by default**; while disabled it **nags once a day** ("the security check is disabled; turn it on,
 so that an unknown agent cannot spoof or attack other agents"), and **stops nagging after three days**;
 but `status().enabled` **is always the truth** ("no more nagging" ≠ "security turned off").
 While disabled, `verify()` lets letters through but reports `skipped: true` (**it does not pretend to have verified**); once enabled it is fail-closed.
 Keys are looked up by the **sender declared in the envelope**, falling back to the shared key (old letters and old members are untouched).
* **`bus`: `offlineOnlyFlag`** —— sending an **online** letter to an "offline-only" member is **refused**:
 non-zero exit + **nothing written to the mailbox** + no silent downgrade + a message that **shows the way out** ("resend with `--mode offline`").
 The attribute name comes **from configuration**; the core knows no concrete attribute name. Not configured ⇒ the rule is entirely off (backward compatible).
* **`roster`: member attributes** —— `member(id)` / `flag(id, name)` / `without(ids, name)` /
 `broadcast()` / `group(name, { without })`; two spellings are accepted (a field on the member / a top-level array of the same name).
 `list()` now **keeps the member's remaining fields** (it used to map only `id`/`label`, eating every custom attribute).
* **`roster`: `groupWithout`** —— broadcasts (both "by group" and "the whole roster") drop members carrying that attribute by default;
 **addressing someone by name is unaffected** (the rule from the tank: "broadcasts skip it, naming it gets through").
 An explicit `without: null` means "do not drop anyone this time".
* **`bus`: `dormantFlag` (only an explicit dormant bounces; we do not guess)** —— a member carrying this attribute is
 **explicitly marked dormant**: sending to them is **refused on the spot** (non-zero + **the letter never enters their mailbox** +
 a message showing the way out; `--force` does **not** exempt it).
 **Never guess dormancy from "how long since their last hello"** —— that is guessing; **there must be an explicit mark**.
 Partially dormant (sending to a group) ⇒ **only the awake ones receive it**, and those dropped are returned in `skippedDormant`
 (the CLI prints **"not delivered to: …"** —— **no silence**).
 The attribute name comes from **configuration**; unset ⇒ the rule is entirely off (backward compatible).
* **Members who receive offline letters only: an online letter is now sent anyway + said so (no refusal)** (ported from the original on 2026-10-10; criteria 58-62 plus "**the keeper's order of 2026-10-06**")
 —— **this is the last of the three "opposite directions"**: it used to throw and refuse; the new rule is
 **send anyway + say plainly "offline-only ⇒ treated as offline for them"** (**never silent**).
 **`mode` is not touched at all** (original criterion 60) —— **it is inside the signature domain** ⇒ quietly rewriting it
 to `offline` would **break the signature**; so the only option is "send anyway (still `online`) + say so".
 The letter **still lands in their own slot**; when sent to a group, **the awake members still receive it**.
 Config: `offlineOnlyFlag` (the attribute name) + **`offlineOnlyMode`** (`'warn'` default = send + say so ／ `'reject'` = the old refusal).
 ⚠️ **The mode is a separate field** —— the first version packed it into `offlineOnlyFlag` (writing `'reject'` as if it were the mode),
 so the core went looking for "a member attribute named `reject`" ⇒ **it blocked nothing at all** (a criterion caught it immediately ⇒ now two fields).
 The disclosure field `wakePrediction.offlineOnly` sits next to `willWait` (same names as in the original).
* **S11: a dormant recipient ⇒ bounce** (ported from the original on 2026-10-10; its criteria 100-106 plus "**the keeper's order of 2026-10-06 02:5x**") ——
 **five rules**: ① **it never enters their mailbox** (nobody will come for it ⇒ putting it there means it piles up forever)
 ② **it goes into the household `退信/`** (**not deleted** —— the sender can still recover it)
 ③ **a `*.why.txt` note is left** (stating "this person cannot receive mail")
 ④ **the result says so** (`verdict: 'bounced'` plus the `bounced` list —— **never silent**)
 ⑤ **it consumes no quota** (it returns **before** `gate.record` —— the same rule as "letters the gate refused take no allowance").
 **This is the reverse of the previous version**: it used to throw and refuse when every recipient was dormant ⇒ now it **bounces and says so**
 (same reason as the other two: "refusing" is **backwards** —— the letter never left, whereas a bounce at least **leaves something you can inspect**).
 It sits **after `seal()`** (a bounced letter still needs an `id`) and **before delivery and accounting** (so "not in their mailbox + no quota" follows naturally).
 Criteria 81 → 84: bounced / not in their mailbox / into `退信/` / **a note is left** / `bounced` disclosed / **quota really unchanged** (gate attached, ledger compared) / `--force` bounces too / a different attribute name still bounces.
 Negative test: short-circuiting the bounce branch turns **5 criteria red immediately**.
* **S6h-③④: mtimes must not lie** (ported from the original on 2026-10-10; its criteria 77-79) ——
 **③ fetching a letter preserves its original mtime**: `pickup` used `writeFileSync` + `renameSync`, which stamps it with **now** ⇒
 a letter "just fetched" looks like one "just arrived" ⇒ **that is letting a fake online letter fool your own gate**
 (both dormancy inference and freshness checks **read mtime**). ⇒ immediately after moving, `utimesSync` **restores the original mtime**
 (measured: the fetched timestamp matches the remote one **to the second**).
 **④ a future timestamp ⇒ judged stale**: `helloFresh` used `Date.now() - sentAtMs < limit` ⇒
 a future `sentAtMs` makes the difference **negative** ⇒ it is "fresh" forever ⇒ **forging a hello dated 2099 makes the handshake gate meaningless**.
 ⇒ a check was added plus **a small skew tolerance** (`helloClockSkewMs`, default **60 seconds**, configurable —— a few seconds of drift between machines is normal,
 but **the tolerance must be small**: "the future" should never be a reason to call something fresh). **The fail-safe rule (verbatim)**:
 "**a misjudgement may only lean towards offline"** —— better to treat "just checked in" as "has not checked in" (the letter waits in the box)
 than to treat "has not checked in" as "just checked in" (which means the letter **cannot be delivered at all**).
* **S6h-①②: how to clean up a half-finished fetch** (ported from the original on 2026-10-10; its criteria 73-76) ——
 **① half-written `.tmp` files**: a **fresh** one ⇒ **leave it alone** (neither import nor delete —— another process may be fetching right now);
 a **stale** one (older than `--tmp-stale-ms`, default 1 hour) ⇒ **MOVE it into the mailbox's `垃圾/`** —— **never delete**
 ("if you cannot read it, move it aside; do not decide its fate for it").
 **② convergent MOVE**: the "half-finished" scene is **the local `inbox/` already has it (step ① done) while the mailbox copy is still in `inbox/` (step ② not done)**.
 The cost of not cleaning it: idempotency marks it "skipped" ⇒ **the mailbox copy stays in `inbox/` forever** (one receipt missing, one letter that can never leave).
 ⇒ **do the MOVE** plus **no accounting** (it was accounted when first imported ⇒ accounting again would double-count).
 Criteria: a fresh half-file is left alone / a stale one goes to `垃圾/` (**not deleted**) / the scene is set up correctly / **the convergent MOVE happens** / **nothing is imported twice**.
* **Structured acknowledgements** (ported from the original on 2026-10-10; "the keeper's order of 2026-10-06 01:5x" plus its criteria 87-90) ——
 **One receipt states two things**: ① `recipientState` (**my state as the recipient**: `online` / `stale-online` / `offline`;
 "am I online" = **is the `hello` I myself sent still fresh** —— the receiving side can work that out alone);
 ② `disposition` (where the letter **went**): `accepted-online` / `delivered-offline-by-stale` (**no fresh hello** ⇒ downgraded) /
 `delivered-offline-by-declaration` (**I declared offline-only** ⇒ this **online** letter was delivered as offline) / `delivered-offline` (nothing was downgraded) / `refused`.
 **`disposition` prefers the delivery note written by the sender** (verbatim: "**that is how it was judged at the time**") ——
 so **the envelope carries a `deliveryNote`** (`'offline-only'` / `'no-handshake'`): what "**the sender wrote down**" must **travel with the letter**;
 `mode` alone cannot tell you **why** it went offline (the first trap I fell into this round).
 New signature-domain fields: `by` / `ok` / `note` / `recipientState` / `disposition` / `peerStateAtSend` / `deliveryNote`
 (they **must** be in the domain —— "one receipt states two things" has to be **detectable if altered**; old acknowledgements are unaffected).
 Criteria 88 → 95: one per state plus **a criterion for the opposite mistake** (an offline letter to an offline-only member stays `delivered-offline`), field completeness, and `recipientState` being computed by the recipient.
 Negative test: breaking the "offline letter" branch turns **2 criteria genuinely red**.
* **There is exactly one source of truth for the signature domain** (fixed 2026-10-10, exposed by a **real bug**) ——
 **The illness**: the `verify` package had **copied `FIELD_ORDER` for itself** (its comment even claimed "identical to `whale-bus`")
 ⇒ and **two lists will always drift**: I added fields such as `peerStateAtSend` in `bus` ⇒
 `verify` judged that **perfectly valid** letter as having an "**unregistered field in the envelope**" ⇒ **refused on the spot and moved it to `退信`**
 (the live scene: `pump` printed `安全校验不过：信封里有未登记字段：peerStateAtSend ⇒ 已挪进"退信"`).
 **The cure**: **if `bus` is wired in, use its table** —— `bus` now **exposes `FIELD_ORDER` / `LEGACY_FIELDS` on its `api`**,
 and `verify` reads them through **`cfg.bus.fields()` (a lazy function)**. No `bus` ⇒ falls back to this package's own copy (behaviour unchanged).
 Why a **lazy function** rather than handing over the array: `bus` does not exist until `services` (which contains `verify`) is built ⇒
 **eager evaluation hits the temporal dead zone** (`Cannot access 'services' before initialization`);
 a **function body is deferred**, so it sidesteps that (my first attempt evaluated eagerly; my second — back-filling `cfg.bus` after construction — **did not take effect**).
 Criteria: `bus` 98 (**`api.FIELD_ORDER` exists + contains the new fields + is not an empty shell**);
 `verify` 47 (**wired in ⇒ use its table** / **not wired ⇒ use the fallback**).
 Negative test: removing the lazy-function branch turns **both `verify` and `cli` red**.
* **An injectable clock (`gate`'s `now`) —— and the day boundary can finally be tested for real** (2026-10-10) ——
 **The illness**: `gate` used **bare `Date.now()` everywhere** ⇒ **fake time was impossible** ——
 and rules like "**when does this take effect**" (original criteria 134-136: "**before** 09:00 `relay` / `authorized`
 keep the old accounting; **after** it the three buckets split") **need a fake clock**.
 **A deeper layer**: the "day boundary" is computed **separately** in `gate` and in `verify`
 (the arithmetic is identical, but the **config keys differ**: `quota.dayBoundaryHour` vs `dayBoundaryHour`
 ⇒ **configure 9 in one and forget it in the other ⇒ the two disagree by a day, and nobody reports anything** ——
 **"silent disagreement" is the worst kind: it does not blow up, it just means the two sides are not counting the same day**).
 **The cure**: `gate` now uses the **same `clockMs` shape** (copied from `verify`: functions, finite numbers, and a **warning** when the value is invalid).
 Criteria (gate 46 → 50): with `now` set, the ledger follows **it** / **before** the boundary (boundary 9, time 08:00) ⇒ the **previous** day /
 **after** the boundary (10:00) ⇒ the **same** day / unset ⇒ real time.
 Negative test: making `now` ineffective turns **1 criterion genuinely red**.
 Also recorded: a trap **the criterion itself fell into**: the "unset `now`" criterion first used `toISOString().slice(0,10)` (**UTC** date),
 while `localDay()` uses the **local** date ⇒ at local midnight they **differ by a day** ⇒ **false red** ——
 yet another "one thing, two algorithms" (UTC vs local), this time **inside a criterion**.
* **`xcheck`: cross-package consistency check (a drift detector)** (added 2026-10-10; `npm run xcheck`) ——
 **Why it exists**: we hit the **same illness** twice in a row ——
 ① the `verify` package **had copied `FIELD_ORDER` for itself** ⇒ I added `peerStateAtSend` in `bus` ⇒
 a **perfectly valid** letter was judged an "unregistered field" and **bounced on the spot**;
 ② `gate` and `verify` **each computed the day boundary** (identical arithmetic, but **the config keys differed**) ⇒
 configure 9 on one side and forget it on the other ⇒ **off by a day, and nobody reports anything**.
 **The common shape**: **one thing written twice, in two packages** —— and "a copy on each side" will always **drift**, however the comment is worded.
 **It checks six things**: ① digest (`bus.digest` ≡ `verify.digestOf`, several samples) / ② signature domain (`bus.FIELD_ORDER` ≡ `verify.fields()`) /
 ③ day boundary (same **fake instant** plus the same boundary ⇒ `verify.localDay()` ≡ the day in `gate`'s ledger) /
 ④ **MAC** (**does `verify` accept a letter that `bus` signed** —— **exactly the "each side is self-consistent, and they explode on contact" case**) /
 ⑤ legacy fields (`LEGACY_FIELDS`) / ⑥ whether the fallback table "says what it is".
 Its criterion is the **exit code** too: 0 = all agree / non-zero = drift. Temporary root, zero contact with real data.
 **It is now part of `npm run selftest`** (8 items —— you no longer have to remember to run it separately after touching something implemented on both sides).
 **The negative test (and it is persuasive)**: make `verify` **use its own** digest ⇒ `xcheck` immediately reports **4/6**:
 · "① digest: **7 samples differ**"
 · "④ MAC: `{"ok":false,"why":"body digest mismatch (**body was modified**)"}`" **and the body was never modified**
 —— changing only the digest triggers both ① and ④, and ④'s wording is the **verbatim scene** of that illness.
 Also wrote "which three things to run after changing code" into `docs/FOR-AGENTS` (CN/EN): `selftest` / `racetest` / `xcheck` plus
 **"booting it for real cannot be skipped"** (a green `selftest` ≠ the engine can load) and **"cut the negative test off at the root"**.
* **The fetching half of S11: letters piled up in a declared-dormant member's mailbox are bounced** (ported 2026-10-10;
 original criteria 105-106 plus "**the keeper's order of 2026-10-06 02:5x**") —— verbatim:
 "when the post office marks a recipient as dormant, the processing centre should return all their mail (**this person cannot receive mail**)".
 **It sweeps two places**: the local `inbox/<who>/` plus **the remote mailbox's `inbox/<who>/`** ——
 **sweeping only the local side is not enough**: a "phone" member's letters **lie in the mailbox waiting to be collected** ⇒ not sweeping it means **nothing was bounced**.
 **Three parts to a bounce**: ① move it into `退信/` (**move only, never delete**) ② **leave `<id>.因休眠退回.说明.txt`**
 (the name says what it is) ③ two hard sentences in the note: "**this letter is not lost** —— it lies here in the bounce folder waiting to be dealt with" /
 "**it never entered** the recipient's mailbox, so it **consumes none of the sender's quota**".
 **⚠️ An inferred dormancy never bounces automatically** (verbatim): otherwise "**bounce the backlog ⇒ the evidence disappears ⇒ judged active again ⇒ backlog again**" **oscillates** ——
 the root of it is "using **one signal** as both **evidence** and **action**"; an inferred state only **says so loudly** in `pickup`;
 to really bounce, **pin it first** (promote the inference into a declaration; that version comes next round).
 Criteria: `cli` 35 → 40 (scene set up correctly / **the bounce** / **the note** / **the note's contents** / **an inferred dormancy does not bounce, only warns**).
 Negative test: switching off the bounce logic to see whether those criteria really go red.
* **`dormant --pin`: promoting an inferred dormancy into a declared one** (ported 2026-10-10; original criterion 106) ——
 Verbatim: "an inferred dormancy **never bounces automatically** —— otherwise 'bounce ⇒ the evidence disappears ⇒ judged active again' **oscillates**;
 to really bounce, **pin it first** (`dormant --pin <member>`) —— **only a pinned state is a declaration**, and only that is stable."
 **What it actually solves**: **it separates "a guess" from "a decision"** ——
 `dormancyOf`'s inference **is always an inference** (`source: 'inferred'`); while **"pinning" is a person's decision**
 ⇒ it is persisted with a trace (**who / why / when**) ⇒ that member now counts as `declared` ⇒ **only then will the bounce logic touch it**.
 **The root of the illness is "one signal serving as both evidence and action"**: "it is not reading its mail" is the **evidence**, and bouncing
 the backlog is the **action** ⇒ **the action destroys the evidence** ⇒ the system **oscillates**. "Pinning" **splits the two**.
 **The loop**: **inferred (loudly reported only) → a person pins it (with a trace) → then it bounces**.
 Commands: `dormant --pin <member> [--why …] [--by …]` (with no arguments it **lists who is pinned**) / `dormant --unpin <member>`
 (unpinning also states **who** pinned it and why). Stored at `<root>/state/pinned-dormant.json`.
 Criteria: `cli` 40 → 45 (pin succeeds **with a trace** / listing / **only a pinned member is bounced** / unpin reports who pinned it).
 Negative test: disabling the "pinned" branch to see whether those criteria really go red.
* **A real bug fixed: the quota ledger's "read-modify-write" loses entries under concurrency** (2026-10-10; found as fallout of the `racetest` work) ——
 **How it was found**: after fixing the watermark last round I **swept for other places with lost updates** ⇒
 targeted `gate`'s quota ledger (it is "read → modify → write back") ⇒ **spawned 12 real child processes, one entry each**:
 · **serial 12 ⇒ letters=12** (the baseline is correct)
 · **12-way concurrent ⇒ letters=8 / 9 / 10** —— **2~4 entries lost**.
 **Why this one matters especially**: the quota ledger is **money** ("the quota is someone else's money") ——
 and **it has no fallback at all** (unlike `seq`, which the watermark covers) ⇒ **what is lost is really lost**.
 **I tried "optimistic retry" (write, read back, retry if different) —— it does not work**:
 `A reads (writers=5) → B reads (5) → B writes (6) → A writes (6)` ⇒ **both read back 6 ⇒ both believe they succeeded**
 (a `+1` counter is **not unique** ⇒ it cannot detect "I was overwritten"). Measured: retrying was **actually worse** (8 lost).
 **The cure came from the original's solution for `ack`**: "**during a broadcast several receivers write the same `<id>.ack.json` ⇒
 rename collides on Windows ⇒ structural elimination: each writes its own file**" —— **"each writes its own" makes collisions physically impossible**.
 **The change**: each entry becomes its own **incremental file** (`state/quota-<as>.d/<timestamp>-<random>.json`) ——
 timestamp plus random ⇒ **two processes write two different files**; reading is "**baseline + sum of all increments**";
 the baseline (the old-format file) **is still read** ⇒ **old ledgers are untouched**.
 `report()` now also returns `days` (with the ledger split in two places, callers **could not tell which days exist** ⇒ the per-day books are handed out too).
 Criteria: `gate` 50 → 53 (serial baseline of 12 / a fresh instance still reads 12 / increment filenames **each its own**).
 Negative test: replacing the random filename with a **fixed** one (simulating the mechanism being broken) ⇒ **4 out of 4 runs lost entries** (the negative is effective).
* **`doccheck`: a structural parity check for the Chinese/English docs** (added 2026-10-10; `npm run doccheck`) ——
 **Why it exists**: we have already been burned **twice** by documentation drift ——
 ① the Chinese `README.md` was **missing two whole sections** ("concurrent claiming: tested" and "**still untested**") while the English one had them ——
 **and what was missing was precisely an**honest statement** ("still untested")** (the rule says "never claim what you have not verified");
 ② after I restored the Chinese side, **the English one was missing the `xcheck` paragraph** (the other direction).
 **Both slipped past a review that only counted headings** —— because **it only looks at headings** and cannot see a missing body section.
 **It checks six things**: heading count (**listed per level** ⇒ easy to locate) / **bullet count** (`^* `) / table count /
 **code fences** (**must be even** —— an odd number means one is unpaired) / link count / **and table column counts consistent within each document**.
 **It found three real defects the moment it went live** (that is the point of building it):
 · **An orphan ``` line in `docs/INSTALL.en.md`** —— **it made the whole second half render as a code block**
 (exactly the "the docs are hard to read" problem);
 · **The English `CHANGELOG` was missing an entire entry** ("`cli`: `verify` / `nag` subcommands") ——
 and **that was the very line I had used as an anchor last round**, **so it got pushed out; I only restored the Chinese one**;
 · the two Chinese `README` sections (restored in the previous commit).
 Its criterion is the **exit code** (0 = all in step / non-zero = drift); **it is now part of `npm run selftest`** (**9 items**).
 Negative test: deleting the English entry I had just restored ⇒ **turns red immediately** (and accurately reports "bullets 43 vs 42").
 ⓘ The first version **false-alarmed** ⚠️: I took "headings 21 vs 23" seriously and went hunting, only to find that **`#` comments inside a code block** were being counted as headings
 ⇒ it now **strips fenced blocks before counting** (while the fences themselves are counted separately —— another criterion needs that).
* **`pkgcheck`: package metadata check** (added 2026-10-10; `npm run pkgcheck`) ——
 **Why it exists**: every pit we fell into around **publishing** lived in **metadata, not code** ——
 · versions: all seven **must share one version** (miss one when releasing ⇒ **the install is half new and half old**);
 · `dsh.bundle.patch`: **without it a plugin package "installs but does nothing" in a real engine**
 (this is written in `INSTALL` §5 rule 1, and **nothing was watching it**);
 · a package with `private: true` **cannot be published** (the root should be private, **the seven must not**);
 · `exports` pointing at a **file that does not exist** (the most common publishing mistake).
 **Its most valuable part is two "deliberate inconsistencies"**:
 · **`cli` **must not have** `dsh`** —— it is an **entry-point tool, not a plugin** (the original's rule, verbatim);
 · **`cli`'s `files` **must not contain** `cordis.patch.yml`** —— it has no patch file.
 **Why these two must be spelled out**: **"a missing field / a missing file" looks exactly like "someone forgot"** ⇒
 the next person will **helpfully add it** ⇒ **turning the CLI into a plugin** —— **and my own first version of this check almost false-alarmed on exactly that**
 (it reported "the seven have two different shapes", I went to look, and found it was **deliberate**).
 **It checks eleven things**: all seven `package.json` files exist / **versions all equal** / the six **all have `dsh`** / **`cli` does not** /
 name prefix / the six share one shape / **`cli` lacks `cordis.patch.yml`** / none of the seven is private / the root is private /
 `exports` targets really exist / **no stray temporary probes in the repo root** (`t-*.mjs` —— **I wrote several myself these past rounds**).
 Its criterion is the **exit code**; **it is now part of `npm run selftest`** (**10 items**).
 Negative test: ① change one package's version ⇒ reports "0.2.1 and 0.2.0 both present"; ② **give `cli` a `dsh` field** (simulating "helpfully adding it")
 ⇒ reports "it has dsh ⇒ it is being treated as a plugin" —— **both genuinely go red**.
* **A real problem found while preparing the release: `cli`'s dependency ranges do not match the new version** (2026-10-10) ——
 **The illness**: `cli`'s `dependencies` had all six sibling packages pinned at `^0.2.0`, and after the version moved to `0.3.0` ——
 **`^0.2.0` means `>=0.2.0 <0.3.0`** ⇒ **it does not match `0.3.0`**
 ⇒ **installing `cli@0.3.0` would pull `0.2.x` siblings ⇒ you get a half-new, half-old install**.
 **Why it is easy to miss**: the criterion "all seven `version` fields are equal" **already looks satisfied** ——
 and "**bump all seven version numbers together**" **is exactly the action that makes you think version work is done**;
 **while dependency ranges live in another field and do not move with it**.
 **New criterion** (`pkgcheck` item ②b): **ranges of intra-repo dependencies must cover the current version**
 (`^x.y.z` / `~x.y.z` / `>=x.y.z` / exact / `*` all accepted). Negative test: setting one dependency back to `^0.2.0` ⇒ **turns red immediately**.
* **The version story is now stated plainly** (`README` / `INSTALL` / `cli/README`, CN and EN):
 **the latest on npm is `0.2.0`** (that is what the `npx` lines above install, **and it does work**);
 while **this checkout is already `0.3.0`** (**in preparation, not yet published**) —— **the two differing is expected**.
 **Why not simply change `npx …@0.2.0` to `@0.3.0`**: **`0.3.0` is not published yet** ⇒
 **the `npx` line would 404 ⇒ anyone following the README would "install it and nothing runs"** —— **exactly the shape of the pit from the previous version**.
* **A real pre-release acceptance run: `npm pack` the tarballs, install them in a clean directory, run them** (2026-10-10) ——
 **Why this step is unavoidable**: "the self-tests are green" does **not** mean "someone else can install it and run it" ——
 **and the difference between those two things lives precisely in the metadata** (not in the code).
 **What was done**: `npm pack` the seven tarballs (with `--pack-destination` ⇒ **not a single `.tgz` left in the repository**)
 ⇒ `npm install` those seven tarballs in a **temporary empty directory** ⇒ run the CLI's `selftest`.
 **Result**: install **9.5 s / exit code 0** (`added 7 packages`) ⇒ `selftest` **exit code 0 / 25 of 25 passed** ——
 **"the copy someone else installs after release really does run"**.
 **It also verified the tarball contents** (this is the truth behind the `files` field): the six plugins ship **5 files**
 (`LICENSE, README.md, cordis.patch.yml, index.js, package.json`); `cli` ships **4**
 (**without `cordis.patch.yml`** —— it should not have one).
 **So `pkgcheck` gained item ③b**: **the file `dsh.bundle.patch` points at must be inside `files`** ——
 it is the **layer below** item ③: item ③ only checks "**is the field there**"; but **the field is there and `files` omits the file** ⇒
 **the tarball carries no patch ⇒ a real engine still says "it installed but does nothing"** (**same symptom, two layers**).
 Negative test: deleting that entry from `bus`'s `files` ⇒ **2 criteria genuinely red** (⑥ shape + ③b naming `bus`).
* **A release checklist, `docs/RELEASE` (CN/EN)** —— **"when you ship a new version, which steps, in what order"**
 **Why it exists**: **publishing is irreversible** (a version on npm cannot be withdrawn, only `deprecate`d) ⇒
 **and "what to do" used to live in a few people's memory** —— **which is exactly the stretch "works out of the box" should cover**.
 **Six steps** (each stating **why** —— otherwise the next person will skip it):
 0 **four green + boot it once** ("green self-tests ≠ the engine can load" —— we hit that);
 1 **ship the six plugins first, `cli` last** (`cli`'s dependencies pin `^<this version>` ⇒ **publishing it first asks for a version that does not exist yet**);
 2 **wait for sync + install it for real** ("green self-tests ≠ someone else can install it");
 3 tag and push the tag (the README says "do not pin the old tag" ⇒ **every usable version needs a tag you can pin**);
 4 **update "what is latest on npm"** (before the release it says "in preparation" ⇒ those two sentences go stale the moment you ship);
 5 run step 0 once more after the edits.
 **Two pits are stated up front**: **you must pass `--registry https://registry.npmjs.org` explicitly**
 (this repository's `.npmrc` defaults to a mirror, **and a mirror cannot publish** —— you see 404 / 403, **not** "no permission").
 **Linked from both READMEs** (right next to "how to install it" —— **easy to find**).
 **`pkgcheck` gained item ⑪**: **a release checklist must not hard-code a version** (use the `<this version>` placeholder)——
 **because a hard-coded one must be edited for every release**, and **forgetting means "you followed the checklist and shipped the wrong version"**
 (the only case where **following the docs makes things worse**, worse than a missing paragraph).
 Negative test: writing a `v0.3.0` into it ⇒ **turns red immediately** (and points at line 29).
 ⓘ `doccheck` **found the new pair automatically** (6 pairs → **7**) —— and CN/EN matched on the **first try**.
* **S6b: mirror the mailbox's acknowledgements back home** (ported from the original 2026-10-10; its criteria 107-110) ——
 **The illness**: `pickup` used to **mirror only `hello/`** ⇒ **`ack/<me>/` on the mailbox was never fetched**
 ⇒ **the sender's own machine could never see "the other side has received it"** (verbatim: "**we never received them**") ——
 and "was the letter I sent actually received" **is the very question a post office exists to answer**.
 **Two rules** (original 108 / 109):
 · **mirror only, never delete** —— the mailbox copy **stays exactly where it is** (same reasoning as mirroring `hello`: that mailbox may have other collectors);
 · **idempotent** —— **identical content is skipped** (otherwise every `pickup` rewrites them ⇒ **and a rewrite moves mtime** ⇒
 **any downstream "how long has this been idle" judgement goes wrong**).
 **Criteria** (`cli` 44 → 48): two acks mirrored / **mirror only, never delete** (the mailbox still has 2) / **idempotent** (a second pickup mirrors 0) /
 **a new ack gets picked up** (exactly one more). Negative test: switching that block off ⇒ **3 criteria genuinely red**.
* **Cross-version compatibility: actually ran `0.2.0` against this version** (2026-10-10) ——
 **How**: `npx -y dsh-whale-post-cli@0.2.0` (**the copy that genuinely exists on npm**) sends ⇒ **this version (`0.3.0`) receives**;
 then the reverse: this version sends ⇒ `0.2.0` receives.
 **Result**:
 · **`0.2.0` sends ⇒ `0.3.0` receives: works** —— an old envelope **still verifies** (canonical includes only fields that are **present**);
 · **`0.3.0` sends ⇒ `0.2.0` receives: bounced** —— the old version reports: "the envelope has a field **not in the signature domain**: `peerStateAtSend`".
 **Why**: this version added 7 fields to the **signature domain** —— and "**no unregistered fields**" is the **old version's** fail-closed rule
 ⇒ **of course it does not recognise the new fields**.
 **It cannot be fixed**: **the old version is already published** ⇒ **you can only know about it and plan the upgrade around it** ——
 written into the `CHANGELOG` as "Read first (2): mixed versions are not compatible" ("upgrade both sides to `0.3.0` first, then start sending").
 **It also answers "why signature-domain fields cannot be added casually"**: **add one field and you add one one-way wall**.
 **Criteria** (`bus` 98 → **100**): the signature domain includes `peerStateAtSend` / **an envelope with only the old fields still gets a signature**.
 Negative test: removing that field from `FIELD_ORDER` ⇒ **genuinely red** (`seal()` refuses on the spot —— **the rule "unregistered fields may not enter the signature domain" polices itself**).
* **New `scripts/compat.mjs`: cross-version acceptance** (2026-10-10; `npm run compat`) ——
 **Why it exists**: last round I **manually** ran `npx -y dsh-whale-post-cli@0.2.0` against this version
 and caught a one-way incompatibility; and **that class of problem is visible only by really running the old version** ——
 **not one "this version only" self-test can see it** (every tool we have exercises only this version)
 ⇒ **without pinning it down, the next signature-domain field adds another one-way wall and nobody knows**.
 **What it does**: **really pulls** the published version from npm (`0.2.0` by default, `COMPAT_OLD` to change it) ⇒
 ① the old version's handshake is understood by this one; ② old sends ⇒ **this version receives it**; ③ **reports** whether this version's letters reach the old one
 (**not judged red** —— "the old version bounces" is **known** and written into the `CHANGELOG` "Read first (2)";
 **and if it ever starts working, that should be seen too** ⇒ so it is printed).
 **Criteria** (4): **needs network + about 42 s** ⇒ **not part of `npm run selftest`**,
 **run it on its own** (the same standing as `racetest`), and it is wired into step 0 of `docs/RELEASE`.
 ⓘ I renamed its criterion from "**this version receives it**" to "**this version can take it in**" ——
 because **it verifies "it parses and is taken in", not signature verification**; verifying the HMAC is the **`verify` package's** job (names must tell the truth).
* **The `bus` "old envelope signature" criterion: I aimed it at the wrong thing, and I stated its limits honestly** (2026-10-10)
 · **Wrong aim**: my first version was `bus.verify({...old, sig}).length === 0` ——
 but **`bus.verify()` checks envelope structure** (`v=1` / `kind` / `mac` / any unregistered fields),
 **it does not verify the HMAC**; verifying the HMAC is the **`verify` package's** (that plugin's) job;
 · **changed to** "field count changes the signature value" (same letter → equal; one extra field → different);
 · **and its negative test did not succeed** —— recorded honestly in the code comments:
 changing canonical to "take the full field list" ⇒ **the criterion stays green** (that is still consistent behaviour for two identically-shaped letters);
 freezing canonical to a fixed value ⇒ **the script fails to parse** ⇒ **exit code 1 with not a single FAIL line** ——
 **that is a false red** ("the script never ran" being read as "the criterion went red" —— **a non-zero exit code does not mean the criterion took effect**).
 ⇒ **what actually guards the selection rule is `compat`** (it really runs the old version). The criterion stays because it at least pins "the signature value varies with the fields".
* **`npm run compat` is wired into the docs**: one row each in `FOR-AGENTS` CN/EN plus step 0 of `RELEASE` ("needs network, about 40 s").
* **`selftest-all` now distinguishes "**a criterion went red**" from "**it crashed**"** (added 2026-10-10) ——
 **The illness**: it used to look only at the **exit code** ⇒ **if one `selftest.mjs` crashed** (syntax error / `ReferenceError`)
 it also reported `FAIL`, **with not a single `FAIL` line** ⇒ **you cannot tell "a criterion is red" from "the script never ran"**.
 **Why this matters**: **I made exactly that mistake last round and read it as "the negative test worked"** ——
 and **a non-zero exit code does not mean the criterion took effect** ("the worst kind of false red").
 **How it decides**: **exit code ≠ 0 with zero `FAIL` lines** ⇒ **that is a crash**;
 and it pulls out the error line itself (`SyntaxError` / `ReferenceError` / …) ⇒ **you see where it broke**.
 **What it looks like now** (measured):
 · **a red criterion** ⇒ `— bus FAIL 98/100 通过 ← 2 条不过` (the script ran to the end);
 · **a crash** ⇒ `— bus FAIL 崩了（退出码 1，一条 FAIL 行都没有 ⇒ 不是判据红）：SyntaxError: …`;
 · **the summary** ⇒ `有件没过：bus、xcheck` plus `其中 **1 件是"崩了"**（不是判据红）：bus`.
 **The two require completely different fixes**: **a red criterion ⇒ the code has a bug**; **a crash ⇒ the self-test itself is broken** ——
 so they **must be reported separately**. (Negative tests: inserting a syntax error ⇒ reports "crashed"; emptying `LEGACY_FIELDS` ⇒ reports "2 条不过".)
* **A criterion-count baseline (`scripts/criteria-baseline.mjs`): counts may only grow, never quietly shrink** (added 2026-10-10) ——
 **The illness**: last round I gave `selftest-all` a defence that "**tells a red criterion from a crash**" ——
 **but the other direction was still open**: **if some `selftest.mjs` runs only 3 criteria and exits 0**,
 **the full run still reports PASS** ⇒ **"341 criteria" is really 340 and nobody knows**.
 **This is a "**silent deletion**"** —— **delete one criterion and the tool **will not shout****;
 a tool that guards a pile of criteria **needs someone guarding it too**.
 **How to use it**: run `npm run selftest` ⇒ **it compares against the baseline automatically** (**growth allowed, shrinkage not**);
 after adding criteria ⇒ `node scripts/selftest-all.mjs --update-baseline` an explicit update (**updating is a deliberate act**).
 **Negative tests, measured** (both really run): commenting out **one** criterion in `types` ⇒
 · **running `types` alone: 13/13 passed, exit code 0** —— **"you cannot see it in isolation"** (exactly why the full run matters);
 · **full run: exit code 1** plus an explicit report "criteria **shrank**: types 14 → 13 (1 fewer)" plus
 the guidance "'shrinking' and 'a red criterion' are two different things —— **red ⇒ the code has a bug**; **fewer ⇒ a criterion was deleted**" plus
 the `--update-baseline` hint.
 ⚠️ It **compares counts only** —— "one criterion swapped for another of the same count" is invisible to it (that needs a human reading the diff);
 what it does catch is the most common case: **commenting out a criterion while editing code**.
 ⓘ **While writing this, `doccheck` immediately caught a table row of mine missing a column** (in both the Chinese and English copies) ——
 **the tools watch each other**, which has now happened several times tonight.
* **Added the `recv` field from the original's "receiving habits are declared by the courier itself"** (2026-10-10) ——
 **I only read that document in round 60**: 《跨设备邮局-1.0局域网实现清单》 (2026-10-06 02:0x)
 appendix three —— **all eight slices S1–S8 were done**, **but two things in that appendix were not**:
 `onlineCapPerDay` was done, **`recv` (`'offline-only'` / `'online-ok'`) was not**.
 **What it means**: "**the criterion moves from a **roster pin** to **the declaration it makes itself****" ——
 that is: **who receives offline-only should be said by that member in its own `hello`**, **not always by a field in the roster**.

 1. `bus`
 · `hello({ as, onlineCapPerDay, recv })` ⇒ `recv` **enters the signature domain** (a self-declaration must be detectable if altered);
 · `declaredRecv(as)` ⇒ **only a fresh hello counts** (an expired lease is not a declaration ⇒ otherwise "said it a year ago" would hold forever);
 · `send`'s `offlineOnly` criterion is now the **union of two sources**: the roster pin + **its own declaration** ——
 **a declaration can widen protection, never narrow it** ("a declaration may only be more conservative").
 · ⚠️ **The original says "no fresh hello ⇒ be most conservative: offline only"** ——
 **and doing that literally does harm**: **in-tank members may have no fresh hello either** ⇒ that branch would **block every online letter inside the tank**.
 ⇒ **only the "explicit declaration" branch was implemented**; "when in doubt, lean conservative" **is left to the phone line**
 (its real meaning is "**a phone that is away naturally has no hello ⇒ offline-only by default**", not "rework the tank").

 2. `cli`
 · `hello --recv offline-only` / `hello --cap 2` (both enter the signature domain, omitted means absent from the envelope);
 · **and more importantly: the disclosure now reaches the sender's eyes** ——
 **The illness**: `wakePrediction.offlineOnly` used to live **only inside the envelope** ⇒ **the sender never saw it** ——
 and "**no silent downgrade**" means "**tell the sender plainly**" (not "quietly write it into the envelope").
 ⇒ `send` now says: "for carol **delivered as offline** (they declared offline-only ⇒ this letter will not wake them) —— not a failure"
 / "for bob **not woken** (no fresh handshake ⇒ downgraded to offline delivery) —— the letter waits in the box".

 3. Criteria: `bus` 100 → **103** (a declarer is disclosed / non-declarers are unaffected / offline letters produce no notice);
 `cli` 48 → **50** ("delivered as offline" appears in the output / "not woken" appears in the output). **346 criteria** in all.
 Negative tests: disabling the `declaredRecv` branch ⇒ **genuinely red**; disabling the output disclosure ⇒ **genuinely red**.

 ⓘ **The criterion-count baseline caught me on its very first real outing**: I inserted the criterion in the wrong place
 (`cli/selftest` has **no** `} catch (err) {` door), **while the baseline had already been changed to 49** ⇒
 the run reported "criteria **shrank**: cli 49 → 48" —— **the check installed in round 59 caught my ordering mistake in round 60**.
* **Added `quiet` (do-not-disturb hours), the third field in the original's appendix three: this is the post-office edition of the peak/valley rule** (2026-10-10) ——
 The original, in one line (the same sentence): `{ "recv": "offline-only | online-ok", "onlineCapPerDay": 3, "quiet": ["22:00","09:00"] }`
 —— last round I added `recv` and `onlineCapPerDay`, **`quiet` was still missing**.
 **What it means**: "**do not wake me from 22:00 until 09:00 the next day**" —— **the same shape as `recv:'offline-only'`**:
 it is **not** "no sending during quiet hours" (**an offline letter wakes nobody anyway**) ⇒
 it governs **online letters only**: inside the window, an online letter to that member ⇒ **delivered as offline + disclosed** (the letter still lands in its slot).

 1. `bus`
 · `hello({ as, onlineCapPerDay, recv, quiet })` ⇒ `quiet` **enters the signature domain** (`['HH:MM','HH:MM']`,
 a malformed value ⇒ **absent from the envelope** —— **better to say nothing than to carry a broken one**);
 · `declaredQuiet(as)` ⇒ **only a fresh hello counts** (same as `recv` —— otherwise "said last week that 22:00 onwards is off-limits" would hold forever);
 · `inQuietHours(as, atMs)` ⇒ **midnight crossing must wrap**:
 `from < to` ⇒ the same-day `[from, to)`; `from > to` ⇒ **crosses midnight**; `from === to` ⇒ **empty range (not quiet)**
 ("quiet all day" must be **said explicitly**, not fudged with equality);
 · `send`'s criterion grew from two sources to **three**: the roster pin + the `recv` declaration + **quiet hours**;
 · `deliveryNote` gained a value `'quiet-hours'` (it is **not** "offline-only" —— that member can normally be woken,
 **just not right now** ⇒ say it separately so the next person knows what to do).
 · ⚠️ **My first version declared `fromQuietNow` inside `if (m === 'online') { … }`** ⇒
 invisible outside that block ⇒ `ReferenceError` —— **and syntax checking cannot see it**, only actually running it explodes (the second time tonight for this class).
 · ⚠️ **It uses local time** ("do not wake me at 22:00" refers to **that member's own** clock, and this post office lives on one machine anyway)——
 across machines this needs rethinking ⇒ **recorded under "still untested"**.

 2. `cli`: `hello --quiet 22:00-09:00` (`from-to` separated by a hyphen, write a midnight-crossing range the same way) plus the output reports "勿扰时段=…".

 3. Criteria: `bus` 103 → **106** (the four boundary points 21:59 not quiet / 22:00 quiet / 08:59 quiet / 09:00 not quiet /
 an online letter inside the window is classed as "not woken" / non-declarers are unaffected); `cli` 50 → **52** (the output reports the quiet hours /
 **the envelope really carries `quiet`** —— not just a printed line). **351 criteria** in all.
 Negative test: breaking the midnight-crossing branch ⇒ **genuinely red**.

 ⓘ **The criterion-count baseline caught me twice more this round** (its second and third real outings):
 ① I inserted a criterion in the wrong place (`cli/selftest` has no `} catch (err) {` door);
 ② **I added a `--quiet` feature to `cli` and forgot the criterion** ⇒ the run reported "cli 51 → 50, shrank" ——
 **what it blocks is exactly "code changed, criteria did not follow"**.
* **Added the "deliver" half of S6: a letter to a remote member is written to the remote `inbox/`, with no second copy kept locally** (2026-10-10) ——
 **How it was found**: in round 67 I started writing the "fake phone" script from **§3** of the original's 《跨设备邮局-1.0局域网实现清单》,
 and partway through I found that **"the tank delivers ⇒ the fake phone receives" simply did not work** —— because **`send` never accepted `--remote`**.
 **The illness**: `pickup` (the **receive** half) had been done long ago, while **`send` only ever wrote the local `inbox/`** ⇒
 **"delivering to the phone" was not implemented at all in the public repository** —— **and the checklist counts it as half of S6**.
 **The original's words** (§1 · S6): "**deliver**: a letter to the phone ⇒ write the remote `inbox/潮信鲸/` (**keep no second copy locally**)".
 **The change**: `send --remote <mailbox root> --remote-only <attribute>` —— members carrying that attribute ⇒ **write remote + delete local**
 (**write remote first, then delete local**: a crash midway leaves the local copy in place ⇒ "**a letter may arrive late, never not at all**").
 **"No second copy locally" is not tidiness**: **keeping one creates two authorities** ⇒ and the two will **disagree** about fetching, receipts and consumption.
 **New `scripts/fake-phone.mjs`** (the "fake phone" §3 asked for): it reads and writes the "simulated mailbox" directory directly with `node`,
 performing the phone's **five actions** —— **PUT hello** / **list**≈`PROPFIND` / **GET** / **MOVE ⇒ seen** / **PUT ack**;
 **both the hello and the ack are genuinely signed** (through `bus.seal` ⇒ **the tank verifies them**).
 **The end-to-end run genuinely works** (the sentence §3 asked for):
 tank `send --remote` ⇒ mailbox `inbox/潮信鲸` **1** ／ local **0** ⇒
 fake phone `--drain` ⇒ `GET` + `MOVE ⇒ seen` + **`PUT ack`** ⇒
 mailbox三处: `inbox` **0** / `seen` **1** / `ack/web` **1** ⇒
 tank `pickup` ⇒ **1 receipt mirrored** ⇒ local `ack/web` **1** —— **closed loop**.
 **Criteria** (`cli` 52 → **54**): a remote member ⇒ written remotely and zero copies locally / without `--remote-only` ⇒ **still local as before**
 ("old behaviour unchanged"). Negative test: switching that block off ⇒ **genuinely red**.
 ⓘ My first version wrote `cfg.remoteOnlyFlag` —— **and there is no `cfg` inside `wire()`** ⇒
 it would `ReferenceError`, **which syntax checking cannot see** ⇒ **only actually running it explodes** ——
 **exactly the shape of lesson 4 in section 10 of `FOR-AGENTS`** ("a name that does not exist", **knowable only by running**).
* **`cli`: `--only-offline <attribute>` / `--dormant <attribute>`** —— both rules can finally be switched on from the command line.
* **`cli`: `verify` / `nag` subcommands** —— the three-state design is finally visible from the command line
 (`verify --enable` / `--disable` / `--allow a,b`; `nag` tells you whether a notice is due).
 ⓘ This entry had gone missing on the **English** side —— and that is exactly what `doccheck` caught
 (the criterion "bullets 43 vs 42"): last round I inserted a new entry using this very line as the anchor,
 which **pushed it out**; I restored the Chinese one then, but **forgot the English one**.
* **No handshake no longer means "refused"** (ported from the original on 2026-10-10; its criteria 1-3 plus "**the keeper's order of 2026-10-06 01:5x**")
 —— **another "opposite direction"**: it used to throw and refuse when there was no handshake; the new rule is
 **send anyway + say plainly "downgraded to offline for them"**.
 Verbatim from the original: "**if you cannot wake them, leave it in the box for them —— but say so loudly**" ——
 and "refusing" is **backwards**: the letter **never leaves**, yet the sender believes "the protocol forbids it"
 (which is at odds with "a letter only arrives late, never not at all").
 Implementation: `requireHello` now has **three states** —— the default truthy value ⇒ **send anyway + `wakePrediction.willWait`**;
 `false` ⇒ no check; **`'reject'` ⇒ keeps the old refusal** (an old deployment writing it sees **no change at all**).
 Alongside: **offline letters never consult the handshake** (they lie there waiting; the handshake is none of their business).
 The return field `wakePrediction.willWait` has the **same name as in the original** (so the two ends can be read against each other later).
* **`cli`: the "do not hang when the link drops" probe in `pickup` (S12)** —— **the fourth item ported from the tank's original**:
 verbatim from the original: "**when SMB drops, synchronous fs calls hang for tens of seconds** (a local disk does not)
 ⇒ `pickup` hangs, and so does sending". ⇒ **probe before touching the postbox**: TCP **445** only;
 a local path is **not probed**; **"Node's synchronous fs has no timeout of its own"** ⇒ the ceiling comes from
 "**a child process + timeout**" (not rewritten as async —— that would drag the whole file along).
 The cache is keyed **by the root string** (a different root is probed again).
 **Measured numbers**: an unreachable UNC ⇒ **judged dead in 2.8 s** (message: "this time **not a single file was touched**");
 with the probe short-circuited ⇒ it takes **22.7 s** to fail —— **that is how the original's "tens of seconds" was confirmed**.
* **`deliver`: dormancy detection v2 (`dormancyOf`)** —— **the third "half" ported from the tank's original**:
 **the v1 lesson** (verbatim from the original): "**do not take 'the postman is alive' for 'they are reading their mail'** ——
 a real deployment exposes it at once: **小毛咪's postman renews her `hello` every 10 minutes, but she herself does not read letters** (what you measure is the postman, not her)".
 ⇒ Two paths, **both carrying `source` (an inference must never be reported as a declaration)**: ① **declared** ⇒ `'declared'`;
 ② **inferred**: **"how long the oldest unread letter in their mailbox has been lying there"**.
 Four states: `awake` / `quiet` / `dormant` plus **`unknown`** (**"we do not know" ≠ "they are dormant"**).
 Two hard rules: **no backlog ⇒ never call it dormant** ("nothing to read ≠ not reading") / **only on-disk mtime is used** (never a timestamp from the content).
 Thresholds `dormantSoftDays: 3` / `dormantHardDays: 7`; **a merely `quiet`/`inferred` recipient is never bounced** (we do not guess).
* **Offline letters are exempt from the whole loop gate** (ported from the original on 2026-10-10; its criteria 29-31 plus "**the keeper's order of 2026-10-06**")
 —— **this is the opposite of what upstream did**: all three loop gates exist to stop "**waking the other side one extra time**",
 and **an offline letter wakes nobody at all** (it just lies there waiting to be collected) ⇒ blocking it **buys nothing**
 and merely traps "what you wanted to say" in the sender's hands. **A gate should stop a cost, not an expression**.
 ⚠️ **Only the loop gate is exempt** —— **quotas still apply** (the offline bucket is counted separately); online letters behave exactly as before.
 One **real problem** was fixed alongside it: `recent` (the table the same-pair loop gate counts) used to include **offline letters too** ⇒
 now that they are exempt, they would still occupy the "wake-up log" ⇒ **wrongly blocking later online letters** ⇒ it now records **online letters only** (that is exactly what a "wake-up log" is).
 Criteria: `gate` has 46 (including the three "offline exemption ①②③", "online letters still bound by gates ①②", and "offline letters still bound by quotas");
 negative test: removing the exemption turns **3 criteria red immediately**. The older `bus`/`cli` criteria that built "refused by the gate"
 out of **offline** letters were updated to use **online** letters (otherwise they go red —— and that would be a **changed definition**, not a bug).
* **S8: the small daily cap on online letters to a "phone" (`bus` + `gate`)** —— **the last item ported from the tank's original**:
 verbatim from the original: "**every online letter = waking a member for one full-context inference** (**the most expensive step**)
 ⇒ a member like a phone, which "may wake up once and fire off several letters", needs a **small daily cap**
 (offline letters are **not subject to it** —— they just lie there waiting)".
 ⇒ **the allowance is `min(the recipient's self-declared `onlineCapPerDay`, the ceiling)`** ——
 **"receiving habits are declared by the member itself, and a declaration can only be more conservative"**
 (they can lower the cap to 1, **never raise it above the ceiling**).
 On the `bus` side: `hello({ as, onlineCapPerDay })` + `onlineCapPerDay` added to `FIELD_ORDER`
 (a self-declaration must also be detectable if altered; old hellos are unaffected —— canonical only includes
 fields that are **present**) + `declaredOnlineCap(as)` to read it back.
 On the `gate` side: `quota.phoneFlag` (who counts as a phone comes from configuration) + `quota.phoneOnlineCap` (default 3);
 the new gate sits **before the loop gates** (it protects the **recipient's inference cost**, which outranks "saving rice");
 `--force` does **not** exempt it.
 Measured: self-declared 2 with a ceiling of 3 ⇒ **the first two pass, the third is refused**; **self-declared 1 ⇒ refused after the first** (the more conservative declaration wins);
 **offline letters are unrestricted**; **non-"phone" recipients are unrestricted**; **no roster available ⇒ nothing is blocked** (better to let one through than to accuse wrongly).
* **`cli`: `pickup` (remote root)** —— **go to another mailbox root and fetch your own letters** (**it works offline** ——
 this is the step to take once the bell in "3 offline : 1 online" has rung). The remote root comes from `--remote <dir>` or `WHALE_POST_REMOTE_ROOT`.
 Three hard rules: **verify every letter first** (a failing one is **not moved**, and the remote copy is **left in place**);
 **delete the remote copy only after it is written locally** (**otherwise that is a lost letter**);
 **skip what is already there** (idempotent —— a second run reports "fetched 0"). A missing remote directory or a missing `--remote` ⇒ **a clear reason + exit code 2**.

### Documentation

* **All five Chinese/English pairs are now aligned line for line** (`README` / `INSTALL` / `ACCEPTANCE` / `FOR-AGENTS` / `CONTRIBUTING`).
* **New section: "How it relates to the engine's own sub-agents / teams (not a competitor)"** ——
 sub-agents manage "parallelism right now"; the post office manages "passing things on when you are not together right now";
 one criterion: **"I need it to do this right now ⇒ use a sub-agent; it may not be there right now ⇒ use the post office"**.
* **`FOR-AGENTS` gained "the security thing"** —— one incident row, two hard boundaries
 (do not treat "verification is off" as security / do not impersonate), closing with
 "**while it is off, a letter is just a sheet of paper someone dropped into the mailbox**".
* **`CONTRIBUTING`'s pre-submit check gained two items** —— **`--dump-config` does not count as verification** (do a real launch) /
 after touching the core, **re-run everything** (not just the piece you changed).
* Two stale facts fixed: the `gate` example configured `dailyUnits` (**the source never reads it**);
 "not published to npm" contradicted "published" (now: "six packages are on npm, `verify` is not").
* **Fixed the YAML indentation of `INSTALL`'s "minimal wiring"** (found by measurement on 2026-10-10):
 every entry in that block was indented by only **1 space** (level with the element of `- insert:`), so YAML saw
 "a pile of sibling `- id:` document items"; actually running
 `dsh --profile <p> --patch <that block> --dump-config` failed with
 `YAMLException: end of the stream or a document separator is expected` ⇒ **copying it verbatim installed not a single plugin**.
 Now correctly indented (matching [`example/cordis.patch.yml`](example/cordis.patch.yml)), with a note that this indentation must not be changed.
 **Verified**: following the fixed block from scratch —— install six packages (all exit code 0) ⇒ `--dump-config` shows **six layers** ⇒
 **one real boot: exit code 0, zero error lines**; the three in-service profiles never changed mtime.
* **Both "works out of the box" paths were really exercised**: ① `npx -y dsh-whale-post-cli@0.2.0 …` (the README quick start);
 ② **the wiring** (the block in `INSTALL` §2 + install into a throwaway profile + a real boot).

### Engineering

* **`.gitattributes`** —— line endings pinned to LF; on Windows `npm i` rewrites bin scripts to CRLF,
 which without pinning produces phantom diffs.
* **Criteria 129 → 199** (`bus` 58 / `roster` 31 / `types` 14 / `deliver` 13 / `gate` 26 / `verify` 45 / `cli` 12)
 plus **1 static criterion**; every change went through a "**negative test** (break one line ⇒ it must turn red)".

### Boundaries and untested areas (still written down, so nobody mistakes them for guarantees)

* **It only solves "one machine"** (the mailbox is a directory on disk; crossing machines needs a shared directory).
* **The chain-depth gate is not a security boundary** (it relies on the replier honestly including `re`);
 **`--force` bypasses the three loop gates** (a deliberate escape hatch, and it leaves a trace).
* **When `verify` is disabled it blocks nothing** —— it is **not "secure by default"**:
 the default tier is "**known insecure + nags you every day**".
* **Concurrent sequence claiming: from "untested" to "tested"** (2026-10-10) —— new `scripts/racetest.mjs` (ported from the tank's original):
 **12 real sub-processes sending at once** ⇒ all exit codes 0 + 12 letters delivered + **every `seq` unique**;
 it also reproduces "the `state` file written backwards" (write `nextSeq` back to 1 ⇒ a new letter still gets a **new number** —— the **watermark** catches it).
 **Still untested**: the truncation path once the `seen` state array grows very long (hand-crafted only).

---

## v0.1.0 —— 2026-10-05

* First version: six pieces (`bus` / `roster` / `types` / `deliver` / `gate` / `cli`) + a composition example +
 three documents (for installers / for people / for agents) + the acceptance specification + MIT;
 129 criteria passed in one run (including negative tests).
* Six packages published to npm (`bus` / `cli` at `0.1.1`).
* A trap worth repeating: a plugin package **must** declare `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`;
 without that line `dsh plugin add` **installs it as a plain dependency and never activates it as a profile layer**.
