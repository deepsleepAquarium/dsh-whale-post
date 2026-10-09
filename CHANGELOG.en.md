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

### ★ Fixes (three ✗ —— the third was found on 2026-10-10 in **real letters inside the shared post-office root**)

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
3. ★★ **Letters from the transition period carrying `auth` could not be received** ✗✓ —— ★**this was found in real letters inside the shared post-office root** ✓:
   the tank's engine **really did write `auth` into envelopes** during a transition (its later decision was "bucket by `mode`, not by `auth` ⇒ the envelope format is unchanged" ✓),
   while our `verify()` treats any field **outside the signature domain** as a bounce ⇒ ★**those letters could not be received at all** ✓.
   ★**Evidence** ✗: the shared root's `inbox/web` held **three** letters addressed to this whale (`潮信鲸`'s "formal check-in" ×2 plus
   "**material: the DSHA porting issue collection (six items, with DNS-poisoning evidence)**") —— all three **were bounced into `退信/` by our implementation** ✓.
   ⇒ `LEGACY_FIELDS = ['auth']` was added: ★**old letters pass (treated as history), new letters stay fail-closed** ✓
   (★`seal()` **still rejects `auth`** ✗ ⇒ it must never appear in a new letter again; ★any other unknown field is still rejected ✓).
   ★After the fix, ★**that "material" letter really was read** ✓ —— that is what the word "compatibility" means in practice.

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
* ★★**`bus`: `dormantFlag` (only an explicit dormant bounces; we do not guess)** ✗✓ —— ★a member carrying this attribute is
  **explicitly marked dormant**: sending to them is **refused on the spot** (non-zero + **the letter never enters their mailbox** +
  a message showing the way out ✓; `--force` does **not** exempt it ✓).
  ★★**Never guess dormancy from "how long since their last hello"** ✗ —— ★that is guessing; **there must be an explicit mark** ✓.
  ★Partially dormant (sending to a group) ⇒ **only the awake ones receive it**, and those dropped are returned in `skippedDormant` ✓
  (the CLI prints **"not delivered to: …"** ✓ —— **no silence** ✓).
  ★The attribute name comes from **configuration** ✓; unset ⇒ the rule is entirely off (backward compatible ✓).
* ★★★ **Members who receive offline letters only: an online letter is now sent anyway + said so (no refusal)** ✗✓ (ported from the original on 2026-10-10; ★criteria 58-62 plus "**the keeper's order of 2026-10-06**" ✓)
  —— ★**this is the last of the three "opposite directions"** ✗: ★it used to throw and refuse ✓; the new rule is
  ★**send anyway + say plainly "offline-only ⇒ treated as offline for them"** ✓ (**never silent** ✗).
  ★★**`mode` is not touched at all** ✗✓ (original criterion 60) —— ★**it is inside the signature domain** ⇒ ★quietly rewriting it
  to `offline` would **break the signature** ✓; so the only option is "send anyway (still `online`) + say so" ✓.
  ★The letter **still lands in their own slot** ✓; ★when sent to a group, **the awake members still receive it** ✓.
  ★Config: `offlineOnlyFlag` (the attribute name) + ★**`offlineOnlyMode`** (`'warn'` default = send + say so ／ `'reject'` = the old refusal ✓).
  ⚠️ ★**The mode is a separate field** ✗ —— the first version packed it into `offlineOnlyFlag` (writing `'reject'` as if it were the mode),
  so the core went looking for "a member attribute named `reject`" ⇒ **it blocked nothing at all** ✓ (★a criterion caught it immediately ⇒ now two fields ✓).
  The disclosure field `wakePrediction.offlineOnly` sits next to `willWait` (★same names as in the original ✓).
* ★★★ **S11: a dormant recipient ⇒ bounce** ✗✓ (ported from the original on 2026-10-10; ★its criteria 100-106 plus "**the keeper's order of 2026-10-06 02:5x**" ✓) ——
  ★**five rules** ✗: ① ★**it never enters their mailbox** ✓ (nobody will come for it ⇒ putting it there means it piles up forever ✓)
  ② ★**it goes into the household `退信/`** ✓ (**not deleted** ✗ —— the sender can still recover it ✓)
  ③ ★**a `*.why.txt` note is left** ✓ (stating "this person cannot receive mail" ✓)
  ④ ★**the result says so** ✓ (`verdict: 'bounced'` plus the `bounced` list —— **never silent** ✗)
  ⑤ ★**it consumes no quota** ✓ (★it returns **before** `gate.record` ✓ —— the same rule as "letters the gate refused take no allowance" ✓).
  ★★**This is the reverse of the previous version** ✗: ★it used to throw and refuse when every recipient was dormant ✓ ⇒ now it **bounces and says so** ✓
  (★same reason as the other two: ★"refusing" is **backwards** —— the letter never left, whereas a bounce at least **leaves something you can inspect** ✓).
  ★It sits **after `seal()`** (★a bounced letter still needs an `id` ✓) and **before delivery and accounting** (★so "not in their mailbox + no quota" follows naturally ✓).
  ★Criteria 81 → 84: bounced / not in their mailbox / into `退信/` / **a note is left** / `bounced` disclosed / **quota really unchanged** (gate attached, ledger compared) / `--force` bounces too / a different attribute name still bounces.
  ★Negative test: short-circuiting the bounce branch turns **5 criteria red immediately** ✓.
* ★★★ **S6h-③④: mtimes must not lie** ✗✓ (ported from the original on 2026-10-10; ★its criteria 77-79 ✓) ——
  ★**③ fetching a letter preserves its original mtime** ✗✓: ★`pickup` used `writeFileSync` + `renameSync`, which stamps it with **now** ⇒
  ★a letter "just fetched" looks like one "just arrived" ⇒ ★★**that is letting a fake online letter fool your own gate** ✗
  (★both dormancy inference and freshness checks **read mtime** ✓). ⇒ immediately after moving, `utimesSync` **restores the original mtime** ✓
  (★measured: the fetched timestamp matches the remote one **to the second** ✓).
  ★**④ a future timestamp ⇒ judged stale** ✗✓: ★`helloFresh` used `Date.now() - sentAtMs < limit` ⇒
  ★a future `sentAtMs` makes the difference **negative** ⇒ it is "fresh" forever ⇒ ★★**forging a hello dated 2099 makes the handshake gate meaningless** ✗✓.
  ⇒ a check was added plus **a small skew tolerance** (`helloClockSkewMs`, default **60 seconds**, configurable ✓ —— ★a few seconds of drift between machines is normal,
  but **the tolerance must be small**: ★"the future" should never be a reason to call something fresh ✓). ★★The fail-safe rule (verbatim) ✗:
  ★"**a misjudgement may only lean towards offline**" ✓ —— ★better to treat "just checked in" as "has not checked in" (the letter waits in the box ✓)
  than to treat "has not checked in" as "just checked in" (which means the letter **cannot be delivered at all** ✗).
* ★★★ **S6h-①②: how to clean up a half-finished fetch** ✗✓ (ported from the original on 2026-10-10; ★its criteria 73-76 ✓) ——
  ★**① half-written `.tmp` files** ✗: ★a **fresh** one ⇒ **leave it alone** ✓ (★neither import nor delete —— another process may be fetching right now ✓);
  ★a **stale** one (older than `--tmp-stale-ms`, default 1 hour) ⇒ ★**MOVE it into the mailbox's `垃圾/`** ✓✓ —— ★★**never delete** ✗
  (★"if you cannot read it, move it aside; do not decide its fate for it" ✓).
  ★**② convergent MOVE** ✗✓: the "half-finished" scene is ★**the local `inbox/` already has it (step ① done) while the mailbox copy is still in `inbox/` (step ② not done)** ✓.
  ★The cost of not cleaning it ✗: ★idempotency marks it "skipped" ⇒ ★**the mailbox copy stays in `inbox/` forever** ✓ (one receipt missing, one letter that can never leave ✓).
  ⇒ ★**do the MOVE** ✓ plus ★★**no accounting** ✗ (it was accounted when first imported ⇒ accounting again would double-count ✓).
  ★Criteria: a fresh half-file is left alone / a stale one goes to `垃圾/` (**not deleted**) / the scene is set up correctly / **the convergent MOVE happens** / **nothing is imported twice**.
* ★★★ **Structured acknowledgements** ✗✓ (ported from the original on 2026-10-10; ★"the keeper's order of 2026-10-06 01:5x" plus its criteria 87-90 ✓) ——
  ★★**One receipt states two things** ✗✓: ① ★`recipientState` (**my state as the recipient** ✓: `online` / `stale-online` / `offline`;
  ★"am I online" = ★**is the `hello` I myself sent still fresh** ✓ —— the receiving side can work that out alone ✓);
  ② ★`disposition` (where the letter **went** ✓): `accepted-online` / `delivered-offline-by-stale` (**no fresh hello** ⇒ downgraded ✓) /
  `delivered-offline-by-declaration` (**I declared offline-only** ⇒ this **online** letter was delivered as offline ✓) / `delivered-offline` (★nothing was downgraded ✓) / `refused`.
  ★★**`disposition` prefers the delivery note written by the sender** ✗✓ (verbatim: ★"that is **how it was judged at the time**" ✓) ——
  ★so **the envelope carries a `deliveryNote`** ✓ (`'offline-only'` / `'no-handshake'`): ★what "**the sender wrote down**" must **travel with the letter** ✓;
  ★`mode` alone cannot tell you **why** it went offline ✓ (★the first trap I fell into this round ✓).
  ★New signature-domain fields: `by` / `ok` / `note` / `recipientState` / `disposition` / `peerStateAtSend` / `deliveryNote`
  (★they **must** be in the domain —— "one receipt states two things" has to be **detectable if altered** ✓; ★old acknowledgements are unaffected ✓).
  ★Criteria 88 → 95: one per state plus ★**a criterion for the opposite mistake** (an offline letter to an offline-only member stays `delivered-offline` ✓), field completeness, and `recipientState` being computed by the recipient.
  ★Negative test: breaking the "offline letter" branch turns **2 criteria genuinely red** ✓.
* ★★★ **There is exactly one source of truth for the signature domain** ✗✓ (fixed 2026-10-10, exposed by a **real bug**) ——
  ★**The illness** ✗: ★the `verify` package had **copied `FIELD_ORDER` for itself** ✓ (★its comment even claimed "identical to `whale-bus`" ✓)
  ⇒ ★and **two lists will always drift** ✓: ★I added fields such as `peerStateAtSend` in `bus` ⇒
  ★`verify` judged that **perfectly valid** letter as having an "**unregistered field in the envelope**" ⇒ ★**refused on the spot and moved it to `退信`** ✗✓
  (★the live scene: `pump` printed `安全校验不过：信封里有未登记字段：peerStateAtSend ⇒ 已挪进"退信"` ✓).
  ★**The cure** ✗: ★**if `bus` is wired in, use its table** —— ★`bus` now **exposes `FIELD_ORDER` / `LEGACY_FIELDS` on its `api`** ✓,
  ★and `verify` reads them through **`cfg.bus.fields()` (a lazy function)** ✓. ★No `bus` ⇒ falls back to this package's own copy (★behaviour unchanged ✓).
  ★★Why a **lazy function** rather than handing over the array ✗✓: ★`bus` does not exist until `services` (which contains `verify`) is built ⇒
  ★**eager evaluation hits the temporal dead zone** (`Cannot access 'services' before initialization` ✗);
  ★a **function body is deferred**, so it sidesteps that ✓ (★my first attempt evaluated eagerly; my second — back-filling `cfg.bus` after construction — **did not take effect** ✓).
  ★Criteria: `bus` 98 (**`api.FIELD_ORDER` exists + contains the new fields + is not an empty shell** ✓);
  `verify` 47 (**wired in ⇒ use its table** / **not wired ⇒ use the fallback** ✓).
  ★Negative test: removing the lazy-function branch turns **both `verify` and `cli` red** ✓.
* ★★★ **An injectable clock (`gate`'s `now`) —— and the day boundary can finally be tested for real** ✗✓ (2026-10-10) ——
  ★**The illness** ✗: ★`gate` used **bare `Date.now()` everywhere** ✓ ⇒ ★**fake time was impossible** ✓ ——
  and rules like "**when does this take effect**" (★original criteria 134-136: ★"**before** 09:00 `relay` / `authorized`
  keep the old accounting; **after** it the three buckets split" ✓) **need a fake clock** ✓.
  ★★**A deeper layer** ✗✓: ★the "day boundary" is computed **separately** in `gate` and in `verify` ✓
  (★the arithmetic is identical ✓, but the **config keys differ** ✗: `quota.dayBoundaryHour` vs `dayBoundaryHour`
  ⇒ ★**configure 9 in one and forget it in the other ⇒ the two disagree by a day, and nobody reports anything** ✓✓ ——
  ★★"silent disagreement" is the worst kind: ★it does not blow up, it just means **the two sides are not counting the same day** ✓).
  ★**The cure** ✗: ★`gate` now uses the **same `clockMs` shape** (★copied from `verify` ✓: functions, finite numbers, and ★a **warning** when the value is invalid ✓).
  ★Criteria (gate 46 → 50): ★with `now` set, the ledger follows **it** ✓ / ★**before** the boundary (boundary 9, time 08:00) ⇒ the **previous** day ✓ /
  ★**after** the boundary (10:00) ⇒ the **same** day ✓ / ★unset ⇒ real time ✓.
  ★Negative test: making `now` ineffective turns **1 criterion genuinely red** ✓.
  ★★Also recorded: a trap **the criterion itself fell into** ✗✓: ★the "unset `now`" criterion first used `toISOString().slice(0,10)` (**UTC** date ✓),
  while `localDay()` uses the **local** date ⇒ ★at local midnight they **differ by a day** ⇒ **false red** ✓ ——
  ★★yet another "one thing, two algorithms" (★UTC vs local ✓), this time **inside a criterion** ✓.
* ★★★ **`xcheck`: cross-package consistency check (a drift detector)** ✗✓ (added 2026-10-10; ★`npm run xcheck` ✓) ——
  ★**Why it exists** ✗: ★we hit the **same illness** twice in a row ——
  ① the `verify` package **had copied `FIELD_ORDER` for itself** ⇒ ★I added `peerStateAtSend` in `bus` ⇒
     ★a **perfectly valid** letter was judged an "unregistered field" and **bounced on the spot** ✗;
  ② `gate` and `verify` **each computed the day boundary** (★identical arithmetic, but **the config keys differed** ✓) ⇒
     ★configure 9 on one side and forget it on the other ⇒ ★**off by a day, and nobody reports anything** ✓.
  ★★The common shape ✗✓: ★**one thing written twice, in two packages** ✓ —— ★and "a copy on each side" will always **drift**, however the comment is worded ✓.
  ★**It checks six things** ✗: ★① digest (`bus.digest` ≡ `verify.digestOf`, several samples ✓) / ② signature domain (`bus.FIELD_ORDER` ≡ `verify.fields()` ✓) /
  ③ day boundary (★same **fake instant** plus the same boundary ⇒ `verify.localDay()` ≡ the day in `gate`'s ledger ✓) /
  ④ ★**MAC** (★**does `verify` accept a letter that `bus` signed** ✓ —— ★exactly the "each side is self-consistent, and they explode on contact" case ✓) /
  ⑤ legacy fields (`LEGACY_FIELDS` ✓) / ⑥ whether the fallback table "says what it is" ✓.
  ★Its criterion is the **exit code** too: 0 = all agree / non-zero = drift ✓. ★Temporary root, zero contact with real data ✓.
  ★**It is now part of `npm run selftest`** ✓ (★8 items ✓ —— ★you no longer have to remember to run it separately after touching something implemented on both sides ✓).
  ★★The negative test (★and it is persuasive ✗) ✓: ★make `verify` **use its own** digest ⇒ `xcheck` immediately reports **4/6**:
    · "① digest: **7 samples differ**"
    · "④ MAC: `{"ok":false,"why":"body digest mismatch (**body was modified**)"}`" ★★ **and the body was never modified** ✓
      —— ★changing only the digest triggers both ① and ④ ✓, and ④'s wording is the **verbatim scene** of that illness ✓✓.
  ★Also wrote "which three things to run after changing code" into `docs/FOR-AGENTS` (CN/EN ✓): ★`selftest` / `racetest` / `xcheck` plus
    ★**"booting it for real cannot be skipped"** ✓ (★a green `selftest` ≠ the engine can load ✓) and ★**"cut the negative test off at the root"** ✓.
* ★**`cli`: `--only-offline <attribute>` / `--dormant <attribute>`** —— ★both rules can finally be switched on from the command line ✓.
* ★★★ **No handshake no longer means "refused"** ✗✓ (ported from the original on 2026-10-10; ★its criteria 1-3 plus "**the keeper's order of 2026-10-06 01:5x**" ✓)
  —— ★**another "opposite direction"** ✗: ★it used to throw and refuse when there was no handshake ✓; the new rule is
  ★**send anyway + say plainly "downgraded to offline for them"** ✓✓.
  ★Verbatim from the original: ★"**if you cannot wake them, leave it in the box for them —— but say so loudly**" ✓ ——
  ★★and "refusing" is **backwards**: ★the letter **never leaves**, yet the sender believes "the protocol forbids it" ✗
  (★which is at odds with "a letter only arrives late, never not at all" ✓).
  ★Implementation: `requireHello` now has **three states** ✗ —— ★the default truthy value ⇒ **send anyway + `wakePrediction.willWait`** ✓;
  ★`false` ⇒ no check ✓; ★**`'reject'` ⇒ keeps the old refusal** ✓ (★an old deployment writing it sees **no change at all** ✓).
  ★Alongside: ★**offline letters never consult the handshake** ✓ (★they lie there waiting; the handshake is none of their business ✓).
  The return field `wakePrediction.willWait` has the **same name as in the original** ✓ (★so the two ends can be read against each other later ✓).
* ★**`cli`: the "do not hang when the link drops" probe in `pickup` (S12)** ✗✓ —— ★**the fourth item ported from the tank's original** ✓:
  ★verbatim from the original: ★"**when SMB drops, synchronous fs calls hang for tens of seconds** ✗ (a local disk does not ✓)
  ⇒ `pickup` hangs, and so does sending ✓". ⇒ ★**probe before touching the postbox**: TCP **445** only;
  ★a local path is **not probed**; ★**"Node's synchronous fs has no timeout of its own"** ⇒ the ceiling comes from
  "**a child process + timeout**" ✓ (★not rewritten as async —— that would drag the whole file along ✓).
  The cache is keyed **by the root string** ✓ (a different root is probed again ✓).
  ★★**Measured numbers** ✗✓: an unreachable UNC ⇒ **judged dead in 2.8 s** (message: "★this time **not a single file was touched**" ✓);
  ★with the probe short-circuited ⇒ it takes **22.7 s** to fail ✓ —— ★**that is how the original's "tens of seconds" was confirmed** ✓✓.
* ★★★ **`deliver`: dormancy detection v2 (`dormancyOf`)** ✗✓ —— ★**the third "half" ported from the tank's original** ✓:
  ★**the v1 lesson** (verbatim from the original): ★"**do not take 'the postman is alive' for 'they are reading their mail'** ✗ ——
  a real deployment exposes it at once: **小毛咪's postman renews her `hello` every 10 minutes, but she herself does not read letters** (★what you measure is the postman, not her ✗)" ✓.
  ⇒ Two paths, ★**both carrying `source` (an inference must never be reported as a declaration ✗)**: ① **declared** ⇒ `'declared'` ✓;
  ② ★★**inferred** ✗✓: ★**"how long the oldest unread letter in their mailbox has been lying there"** ✓.
  Four states: `awake` / `quiet` / `dormant` ★plus **`unknown`** (★**"we do not know" ≠ "they are dormant"** ✓).
  ★Two hard rules: ★**no backlog ⇒ never call it dormant** ✗ ("nothing to read ≠ not reading" ✓) / ★**only on-disk mtime is used** ✓ (never a timestamp from the content ✓).
  ★Thresholds `dormantSoftDays: 3` / `dormantHardDays: 7` ✓; ★**a merely `quiet`/`inferred` recipient is never bounced** ✗ (we do not guess ✓).
* ★★★ **Offline letters are exempt from the whole loop gate** ✗✓ (ported from the original on 2026-10-10; ★its criteria 29-31 plus "**the keeper's order of 2026-10-06**" ✓)
  —— ★**this is the opposite of what upstream did** ✗: ★all three loop gates exist to stop "**waking the other side one extra time**" ✓,
  ★and **an offline letter wakes nobody at all** (it just lies there waiting to be collected ✓) ⇒ blocking it **buys nothing**
  and merely traps "what you wanted to say" in the sender's hands ✓. ★★**A gate should stop a cost, not an expression** ✓✓.
  ⚠️ ★**Only the loop gate is exempt** ✗ —— ★**quotas still apply** ✓ (the offline bucket is counted separately ✓); ★online letters behave exactly as before ✓.
  ★One **real problem** was fixed alongside it: `recent` (the table the same-pair loop gate counts) used to include **offline letters too** ✗ ⇒
  now that they are exempt, they would still occupy the "wake-up log" ⇒ ★**wrongly blocking later online letters** ✓ ⇒ it now records **online letters only** ✓ (that is exactly what a "wake-up log" is ✓).
  ★Criteria: `gate` has 46 (including the three "offline exemption ①②③", "online letters still bound by gates ①②", and "offline letters still bound by quotas" ✓);
  ★negative test: removing the exemption turns **3 criteria red immediately** ✓. The older `bus`/`cli` criteria that built "refused by the gate"
  out of **offline** letters were updated to use **online** letters (★otherwise they go red —— ★and that would be a **changed definition**, not a bug ✓).
* ★★★ **S8: the small daily cap on online letters to a "phone" (`bus` + `gate`)** ✗✓ —— ★**the last item ported from the tank's original** ✓:
  ★verbatim from the original: ★"**every online letter = waking a member for one full-context inference** ✗ (**the most expensive step** ✓)
  ⇒ a member like a phone, which "may wake up once and fire off several letters", needs a **small daily cap** ✓
  (★offline letters are **not subject to it** ✓ —— they just lie there waiting ✓)".
  ⇒ ★**the allowance is `min(the recipient's self-declared `onlineCapPerDay`, the ceiling)`** ✓ ——
  ★★**"receiving habits are declared by the member itself, and a declaration can only be more conservative"** ✗✓
  (they can lower the cap to 1 ✓, **never raise it above the ceiling** ✗).
  ★On the `bus` side: `hello({ as, onlineCapPerDay })` + `onlineCapPerDay` added to `FIELD_ORDER`
  (★a self-declaration must also be detectable if altered ✓; ★old hellos are unaffected —— canonical only includes
  fields that are **present** ✓) + `declaredOnlineCap(as)` to read it back ✓.
  ★On the `gate` side: `quota.phoneFlag` (★who counts as a phone comes from configuration ✓) + `quota.phoneOnlineCap` (default 3 ✓);
  ★the new gate sits **before the loop gates** ✓ (★it protects the **recipient's inference cost**, which outranks "saving rice" ✓);
  ★`--force` does **not** exempt it ✓.
  ★Measured: self-declared 2 with a ceiling of 3 ⇒ **the first two pass, the third is refused**; ★**self-declared 1 ⇒ refused after the first** (★the more conservative declaration wins ✓);
  ★**offline letters are unrestricted** ✓; ★**non-"phone" recipients are unrestricted** ✓; ★**no roster available ⇒ nothing is blocked** ✓ (better to let one through than to accuse wrongly ✓).
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
* ★**Concurrent sequence claiming: from "untested" to "tested"** ✗✓ (2026-10-10) —— new `scripts/racetest.mjs` (★ported from the tank's original ✓):
  **12 real sub-processes sending at once** ⇒ all exit codes 0 + 12 letters delivered + **every `seq` unique** ✓;
  ★it also reproduces "the `state` file written backwards" (write `nextSeq` back to 1 ⇒ a new letter still gets a **new number** ✓ —— the **watermark** catches it ✓).
  ★**Still untested** ✗: the truncation path once the `seen` state array grows very long (hand-crafted only).

---

## v0.1.0 —— 2026-10-05

* ★First version: six pieces (`bus` / `roster` / `types` / `deliver` / `gate` / `cli`) + a composition example +
  three documents (for installers / for people / for agents) + the acceptance specification + MIT;
  ★129 criteria passed in one run (including negative tests).
* ★Six packages published to npm (`bus` / `cli` at `0.1.1`).
* ★A trap worth repeating: a plugin package **must** declare `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`;
  without that line `dsh plugin add` **installs it as a plain dependency and never activates it as a profile layer**.
