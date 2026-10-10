# Installation and wiring (INSTALL)

> 中文: [INSTALL.md](INSTALL.md)

## 0. Prerequisites
* An engine that supports plugins and dependency injection (this repository is written in the Cordis style: `cordis.patch.yml` + `ctx` services).
* **Node ≥ 20**. This repository has **zero runtime dependencies** (it only uses `node:` built-in modules).

## 1. Installing
```bash
# install from the registry once published
dsh plugin --profile <profile> add dsh-whale-post

# local development: you must use link: (source edits take effect immediately)
dsh plugin --profile <profile> add link:/abs/path/to/dsh-whale-post
```
**Two honest truths (we bought them with blood)**:
1. Installing a local package with `file:` = **copying a snapshot** ⇒ your source edits **do not take effect**; if you want to change the code, use `link:` (or a directory junction).
2. A running engine **caches ESM by URL** ⇒ **after changing code you must restart the engine** (restart even for a one-line change, otherwise you are testing the old code).

## 2. Minimal wiring (`cordis.patch.yml`)

> **⚠️ Read this before the YAML below — it matters more than the YAML. There are two ways to install, and you must pick exactly one.**
>
> Measured on 2026-10-10, both really booted in a throwaway profile:
>
> * **A. Install with `dsh plugin --profile <name> add link:<this repo>/packages/<package>`.** That writes the package
>   names into the profile's `package.json` under `dsh.profile.bundles`, and every package **ships its own**
>   `cordis.patch.yml` (its `dsh.bundle.patch`) ⇒ **it takes effect immediately; you write nothing into
>   `cordis.patch.yml`.** Measured: exit code 0, 32.4 s.
> * **B. Put the packages into the profile's `node_modules` and hand-write the `cordis.patch.yml` below.** If you go
>   this way you **must first delete every `dsh-whale-post-*` entry from `dsh.profile.bundles`**, leaving only the
>   official `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-headless`. Measured: exit code 0, 27.1 s.
>
> **Mixing the two crashes immediately**: each plugin gets registered twice and the boot fails with
> `service "whale.bus" has been registered at <whale-bus>` ⇒ nothing starts at all.
> In other words: **if you ever see the word `registered` in the error, you have gone down both roads — go look at
> `dsh.profile.bundles` for those seven package names.**

> **Do not change the indentation of this block** — measured on 2026-10-10: it used to indent every entry by only **1 space**
> (level with the element of `- insert:`), so YAML saw "a pile of sibling `- id:` document items" and failed with
> `YAMLException: end of the stream or a document separator is expected` ⇒ **not a single plugin could be installed**.
> The version below has **correct indentation and was really run through `--dump-config` and a real boot**
> (it is **behaviourally equivalent to, but not word-for-word the same as** [`../example/cordis.patch.yml`](../example/cordis.patch.yml) —
> that one is a **complete example** (it spells out `requireHello: true` and lists two more quota types,
> `broadcast` and `club`), while this one is **minimal wiring**. Neither difference changes behaviour:
> the default for `requireHello` is already `true`, and the two extra types are only sample numbers).

```yaml
- insert:
    - id: whale-bus
      name: dsh-whale-post-bus
      config:
        root: '~/.dsh/whale-mail'      # your choice; ★code default is ./.whale-mail (current dir)
        apiVersion: 1

    - id: whale-roster-json
      name: dsh-whale-post-roster
      config:
        file: '~/.dsh/whale-mail/roster.json'   # the roster contents are filled in by you

    - id: whale-types-sample
      name: dsh-whale-post-types
      config:
        types: [direct, broadcast, club]        # example types; register your own types yourself

    - id: whale-deliver
      name: dsh-whale-post-deliver              # example ①: offline post office (★the live-session probe lives here ✓)

    - id: whale-gate
      name: dsh-whale-post-gate                 # example ②: quota and billing gate
      config:
        quota:                                  # ★the gate reads config.quota.*
          onOver: reject                        # reject = refuse to send (non-zero exit) ／ price = send anyway, bill it
          types:
            direct: { label: 'direct', limit: 120 }
            offline: { label: 'offline', limit: 80, perSend: true }   # ★offline is counted per send

    - id: whale-verify
      name: dsh-whale-post-verify               # ★security check (envelope signature + allow-list)
      config:
        enabled: false                          # ★disabled by default; set true to enable (while disabled it nags you, for three days)
```
**Wiring points**: the six plugins rely on each other **only through interfaces** (`ctx.whale.*`) ⇒ **the order in which they are written does not matter**; the core **does not know any names or types** — you can replace the roster implementation or change the type table without touching a single line of the core.
**Every quota number above is an example** ⇒ scale it to your own volume; extreme values (like `limit: 0`) will slam the gate shut immediately.

### Where members come from (example roster file)
```json
{ "apiVersion": 1,
 "members": [ { "id": "alice", "label": "Alice" },
 { "id": "bob", "label": "Bob" } ] }
```
`id` is the **mailbox directory name** used for delivery (`<root>/inbox/<id>/`); **the contents of the roster never enter the code**.

## 3. Is it installed or not

> **Which version you are getting**: **the latest on npm is now `0.4.0`**; while **this checkout is `0.4.0` too** (**the two now agree**).
> The two **differing is expected** — the `npx` lines below install **`0.4.0`** (and it does work).
>
> **All seven packages are on npm at `0.4.0`** (including the first release of `verify`) ⇒ you can go straight to `npx -y dsh-whale-post-cli@0.4.0 …`;
> to develop inside the repository (or change the source) ⇒ run from the repo path (`node packages/cli/index.js …`).
> ⓘ **Do not use `0.1.x`** — with it, all six plugins fail to load in a real engine (see the "read this before upgrading" section of `CHANGELOG`).
```bash
node packages/cli/index.js selftest # ★look only at the exit code: 0 = pass; non-zero = fail (do not read the Chinese)
node packages/cli/index.js send --as alice --to bob --subject 'hello' --body 'first letter'
node packages/cli/index.js pump --as bob # read through bob's mailbox once (★this consumes the letters)
```
> Note that in those three commands `send` and `pump` have **no `--root`** ⇒ they use the **default mailbox root `./.whale-mail`**
> (right under your current directory). That path **is already in `.gitignore`**, so running these inside the repository
> **will not leave untracked files behind**.
> (Measured: with `roster.json` inside `.whale-mail/`, `git status` reported `?? .whale-mail/` before this line existed.)
**Three hard rules**: ① **look only at the exit code** (do not match on the Chinese text); ② **it can be re-run in place** (two runs give the same result); ③ **negative test**: **deliberately break one line ⇒ the self-test must turn red** (not turning red = the self-test is decoration).

**The runner that ships with this repository** (you can verify it before installing anything): `node scripts/selftest-all.mjs` ⇒ **exit code 0 = all six passed**; to run a single piece, `node packages/<package-name>/selftest.mjs`.
**From npm** (published): `npm i dsh-whale-post-cli` ⇒ `npx dsh-whale-post-cli selftest`.

**Collecting mail (important — do not skip)**: `pump` **consumes by default** (it moves letters into `seen/` and writes an ack) — **but** when the recipient has **no live session** right now and nothing has declared itself a reader, `pump` **consumes nothing**: letters stay exactly where they are in `inbox/` (not moved to `seen/`, not unlinked, no ack written).
To keep undeliverable mail in the mailbox, use `keep`: `keep: true` (look but do not consume) or `keep: (letter) => boolean` (decide per letter); from the command line, pass `--keep`. To consume, you have to **declare yourself a reader**: `reader: true` (that is what the CLI does when it prints letters to the terminal).
This is the **receiving half** of "**mail may arrive late, but it never goes missing**" — without it, letters get silently eaten while the recipient is away.

**The one wiring point for a real engine: the `sessionOf` probe (read this before you wire anything up)**
The core **does not know about "engines" or "sessions"** — it only knows one probe function:
```js
sessionOf(id) => ({ live: true, inject: (text) => { /* deliver this text into that session */ } })   // or undefined
```
Two equivalent ways to wire it:
* `createBus({ probes: { sessionOf } })` — hand it straight to the core;
* configure `sessionOf` on `dsh-whale-post-deliver` — the core picks up `services.deliver.sessionOf` automatically.

Three rules (do not mix them up):
1. **It only decides whether an online letter can actually be handed over** — if the probe says "no such session" (or nothing is wired), the online letter is judged **`kept`**: **it stays in `inbox/` and waits** (**late, never lost**);
2. **`pump`'s permission to consume does NOT consult it** — consuming requires `inject` or an explicit `reader: true` (**"the session is alive" ≠ "the letter reached a reader"**);
3. **If you pass `inject`, it is really called; if it throws, nothing is consumed** — a letter that cannot be handed over is never treated as handed over.

## 4. Packages and interfaces at a glance

### First, the four roles (understand this and the rest will not confuse you)

| Role | What question it answers | Who plays it |
|---|---|---|
| **Core** | what a letter looks like, how it is signed, how it is persisted — **it knows no names and no types** | `bus` |
| **Interface pieces (providers)** | **who is on the roster** / **what type a letter is** — **swap the implementation and the core does not change a line** | `roster`, `types` |
| **Policy pieces** | **whether to deliver / whether to block / whether to verify** — these are the "hook points" | `deliver`, `gate`, `verify` |
| **Entry-point tool** | **how a human uses it from the command line** (**it is not a plugin**) | `cli` |

### Packages

| Package | Role | Interfaces provided / used |
|---|---|---|
| `dsh-whale-post-bus` | Core: envelope / digest + HMAC signature / handshake / idempotency / persist to disk | provides `ctx.whale.bus` |
| `dsh-whale-post-roster` | **Who receives** (the interface piece + a sample that reads JSON) | provides `ctx.whale.roster` |
| `dsh-whale-post-types` | **What type a letter is** (the interface piece + a sample) | provides `ctx.whale.types` |
| `dsh-whale-post-deliver` | **Delivery strategy** (= the hook point of example ①) | uses `bus` / `roster` |
| `dsh-whale-post-gate` | **Gate**: quota and billing + loop gate (= the hook point of example ②) | uses `bus` / `types` |
| `dsh-whale-post-verify` | **Security check** (envelope signature + allow-list), disabled by default | uses `bus` (optional: borrows its `digest` / `sign`) |
| `dsh-whale-post-cli` | Entry-point tool (**not a plugin**) | uses `bus` |
| `example/` | Composition example: a minimal `cordis.patch.yml` + the criteria for one run | everything |

### Interfaces (one sentence per method)

| namespace | Method | In one sentence |
|---|---|---|
| `ctx.whale.bus` | `send(letter)` | send one; **a refusal is a refusal** (it throws ⇒ the CLI exits non-zero) |
| | `pump({ as, keep, reader })` | receive; **no reader ⇒ nothing is consumed** (letters stay put) |
| | `verify(letter)` | returns the **list of problems** with an envelope (empty = fine) |
| | `hello({ as })` | handshake (senders check how fresh yours is) |
| | `helloFresh(as)` / `FIELD_ORDER` / `LEGACY_FIELDS` | is a handshake fresh / **the order of the signed fields** / **the old field names** (you need both if you compute a signature yourself) |
| | `declaredOnlineCap(as)` / `declaredRecv(as)` / `declaredQuiet(as)` | the three things the other side **declared about itself** in its handshake: its daily cap for online letters / offline-only / its do-not-disturb window (only a fresh handshake counts) |
| | `inQuietHours(as, atMs?)` | is it inside its do-not-disturb window now (or at a given instant); **the window wraps around midnight** |
| | `format(env)` | render an envelope as human-readable text |
| | `paths()` / `root()` / `keyHex()` / `digest(s)` / `seal(f)` / `sign(env)` / `loadState(as)` | low-level parts (used by self-tests, tools and the gate) |
| `ctx.whale.roster` | `list()` / `has(id)` / `label(id)` | the minimal set: who is there / is this person there / what are they called |
| | `member(id)` | **the whole member record** (including custom attributes) |
| | `flag(id, name)` | **member attributes**: `name` is supplied by the caller (a field on the member or a top-level array) |
| | `without(ids, name)` | **drop** members carrying that attribute from a list |
| | `broadcast()` | **who a broadcast should go to** (already filtered by `groupWithout`) |
| | `groups()` / `group(name, opts)` | group names / one group's members (`opts.without` drops some just for this call) |
| `ctx.whale.types` | `register(id, meta)` / `resolve(id)` / `list()` / `meta(id)` | register / look up / list; **an unregistered type is refused on the spot** |
| `ctx.whale.deliver` | `deliver(letter, ctx)` | returns `'delivered'` / `'kept'` / `'rejected'` |
| | `blocked(id)` / `sessionOf(id)` | is this recipient blocked / is that session alive |
| | `dormancyOf(id)` | is this person **explicitly dormant** (used by the two above) |
| `ctx.whale.gate` | `check(letter, ctx)` | block or not: `'pass'` / `{ reject, reason }` |
| | `record(letter, targets)` / `report({ as, days })` | record after a successful delivery / read the ledger |
| | `quotaUnits(letter, types, bucket)` | how many "units" one letter costs (for your own estimates or a dashboard) |
| `ctx.whale.verify` | `verify(letter)` | `{ ok, why?, skipped? }`; **while disabled it lets letters through but says `skipped: true`** |
| | `nag()` | returns the notice when one is due, `null` when it is not |
| | `status()` / `enable()` / `disable()` | the truthful status / turn on / turn off |
| | `keyFor(from)` / `digestOf(body)` / `fields()` / `FALLBACK_FIELD_ORDER` | the parts verification needs: someone's key / a body digest / the signed fields taken from `bus` / the fallback when that is unavailable |

> Every package also exports `apiVersion` (the interface version; currently `1`), and `gate` and `verify` additionally expose their own `cfg` (the configuration currently in force).

### Configuration (including "what happens if you leave it out")

| Package | Field | Default | Meaning |
|---|---|---|---|
| `bus` | `root` | `WHALE_POST_ROOT` ⇒ `./.whale-mail` | mailbox root (**this is where letters land**) |
| | `keyFile` | `<root>/signing.key` | signing key (generated on first use) |
| | `maxBody` | `64 KiB` | body size limit |
| | `requireHello` | `true` | **three states**: the default ⇒ **send anyway + say plainly "downgraded to offline"** (via `wakePrediction.willWait`); `false` ⇒ no check; **`'reject'` ⇒ the old "refuse to send"**. **offline letters never look at the handshake** |
| | `helloMaxAgeMs` | `24 hours` | how old a handshake may be |
| | `defaultType` | `'direct'` | set it to `null` ⇒ **a letter with no type is refused** (we do not guess for the caller) |
| | `offlineOnlyFlag` + `offlineOnlyMode` | unset / `'warn'` | **three states**: unset ⇒ off; an attribute name ⇒ **send anyway + say so** (`wakePrediction.offlineOnly` — criteria 58-62: **no more refusal**); `offlineOnlyMode: 'reject'` ⇒ **the old refusal** |
| | `dormantFlag` | unset | a member **explicitly marked dormant** is **refused on the spot** (the letter **never enters their mailbox**; `--force` does not exempt it). **Never guess dormancy yourself** (not from "how long since their last hello" — the rule from the tank: "**only an explicit `dormant` bounces; do not guess**") |
| `roster` | `file` | `<root>/roster.json` | the roster file |
| | `groupWithout` | unset | **broadcasts drop** members carrying this attribute by default (see §7) |
| | `sample` | `false` | `true` ⇒ fall back to the built-in sample when the file is missing (for a quick try only) |
| `types` | `types` | three samples | the type table; **both array and object spellings are accepted** |
| | `extra` | unset | **register more** on top of the samples |
| `deliver` | `sessionOf` | not wired | **the only wiring point into a real engine** (see §3) |
| | `blocked` | `[]` | recipients that are explicitly blocked (letters never enter their mailbox) |
| | `oldestPendingMs` | not wired | **the probe for the inferred dormancy path**: `(id) => the on-disk time of the oldest unread letter in that mailbox (ms; 0 ⇒ no backlog)`. Not wired ⇒ **it truthfully reports `unknown`** ("we do not know" is said as such) |
| | `declaredDormant` | not wired | **the explicit-dormancy probe**: `(id) => boolean` (who is marked dormant comes from the roster/config) |
| | `dormantSoftDays` / `HardDays` | `3` / `7` | the thresholds for "awake" / "quiet" / "dormant" (**hard rule: no backlog ⇒ never call it dormant**) |
| `gate` | `quota.onOver` | `'reject'` | `'reject'` refuses to send / `'price'` **sends anyway and bills it** ("a price gate, not a gag") |
| | `quota.dayBoundaryHour` | `0` | day boundary: `0` = calendar day; `9` = "9am to 9am the next day counts as one day" |
| | `quota.types` | four sample buckets | each bucket has a `limit`; **the offline bucket may set `perSend: true`** (counted per send, group sends do not multiply) |
| | `quota.defaultLimit` | `120` | types **not in the table** fall into this bucket |
| | `quota.bucketRules` | unset | **which field decides the bucket**: `[{ field, equals, bucket }]`, **the first match wins**, top to bottom; **both the field name and the bucket name come from configuration**. Unset ⇒ behaviour is unchanged. Example, four tiers by authorisation level: `[{ field: 'auth', equals: 'self', bucket: 'self' }, …]` plus a `limit` for `self` / `relay` / … under `types` |
| | `quota.defaultBucket` | unset | which bucket to use when no rule matches (only meaningful when `bucketRules` is set) |
| | `quota.phoneFlag` | unset | **who counts as a "phone"** (attribute name from configuration): such recipients are subject **only to the small daily online-letter cap** — **every online letter = waking them for one full-context inference** (the most expensive step). Unset ⇒ this gate is entirely off |
| | `quota.phoneOnlineCap` | `3` | **the ceiling**: the effective allowance is **`min(the recipient's self-declared `onlineCapPerDay`, this)`** — **"a declaration can only be more conservative"** (they can lower it to 1, **never raise it above the ceiling**). No declaration ⇒ **the ceiling applies** |
| | `loop.ackMaxBytes` / `ackOnly` | `40` / English+Chinese receipt words | **pure receipts are refused** |
| | `loop.pairWindowMs` / `pairMax` | `20 minutes` / `3` | **how many letters one pair may exchange inside that window** |
| | `loop.hopMax` | `3` | chain-depth cap (a politeness / cost gate, **not a security boundary**) |
| `verify` | `enabled` | **`false`** | **disabled by default** — deliberately, not "not written yet" |
| | `allow` | `[]` | allow-list; **empty ⇒ recipients are unrestricted** |
| | `nagDays` | `3` | **nags for this many days and then stops** (the status still truthfully says disabled) |
| | `keysDir` / `keyFile` | `<root>/keys` / `<root>/signing.key` | **keys are looked up by the sender declared in the envelope**; no dedicated key ⇒ **fall back to the shared key** |
| | `now` | not injected | inject a clock (for self-tests) |

### "I want to X ⇒ use which one" (an index)

| I want to… | Use |
|---|---|
| send a letter | `bus.send({ as, to, subject, body, mode })` |
| receive letters | `bus.pump({ as, reader: true })` |
| **fetch letters from another mailbox root** | `pickup --as <who> --remote <the other mailbox root>` (works offline; `WHALE_POST_REMOTE_ROOT` also works) |
| broadcast | `send({ to: 'all' })` or `to: '<group>'` |
| keep someone off broadcasts | `roster`'s **`groupWithout`** (addressing them by name still works) |
| make someone receive offline letters only | `bus`'s **`offlineOnlyFlag`** (an online letter is **refused, with the way out spelled out**) |
| **someone has been away for a long time (explicitly dormant)** | `bus`'s **`dormantFlag`** (sending **is refused on the spot and nothing enters their mailbox** — so letters do not pile up in a mailbox nobody visits; **we do not guess from elapsed time**) |
| cap how much can be sent per day | `gate`'s **`quota.types`** |
| stop two agents from looping | `gate`'s **`loop.*`** (on by default) |
| require signatures + an allow-list | `verify`'s **`enabled: true` + `allow`** |
| see whether to turn verification on | `npx dsh-whale-post-cli nag` |
| wire it into a real engine | `deliver`'s **`sessionOf`** |

## 5. Rules for writing a plugin (follow them; do not step in the pits we fell into)
1. **Know interfaces, not names**: the core code must not hard-code **any** member name / type identifier / internal path (rosters and types are always registered in).
2. Shape: `export const name = '...'` + `export function apply(ctx, config = {})`.
3. **Zero I/O and zero side effects at the top level**: at the moment the module is `import`ed it must not read from disk, must not send letters and must not start timers (put everything inside `apply`).
4. **Do not use `inject`** (when it is not satisfied it **hangs silently**, and you will not even see a log line) ⇒ instead **fetch the service at runtime**: `ctx.get('whale.bus')`.
5. **A missing service must not blow up**: if you cannot get it, log a line and **try again on the next tick** (a plugin loading before its service is registered is the normal case).
6. **Log only when the state changes**: otherwise you get one line per tick and the log turns into a waterfall (we really did flood it once).
7. **Swallow your own exceptions**: never throw an exception back into the engine (one error that escapes can take the whole engine down).
8. **Everything is configurable**: root directory / interval / signer name / paths all come from `config`; do not hard-code them in the code.
9. **Carry `apiVersion`**: both type identifiers and the envelope format reserve a version slot ("extensible at any time" is a hard requirement).
10. **Atomic persist to disk**: write a temporary file + `rename` (a half-written file = one fake hang).
11. **The signature must cover every semantic field**: leaving one field unsigned (for example `mode` / priority) = someone else can silently rewrite it (this is exactly the hole we closed with "`mode` goes into the signature too").
12. **Idempotent**: the same letter is consumed only once (deduplicated by message id); a replay must not deliver twice.
13. **Offline by default**: waking the other side requires an **explicit** `online` — do not let "online by default" flood someone else's session.
14. **Before handing in**: a **load-level self-test** + `selftest` turning green + **one real launch to check the log for load errors** — passing syntax and passing module-level self-tests **do not count** (this is exactly how we went down: 7 entry points all crashed on the same line).

## 6. Common failures
| Symptom | Most likely cause | What to do |
|---|---|---|
| The plugin is installed but "does nothing" | You used `inject` / you fetched the service at the top level | Fetch the service at runtime + retry every tick |
| **It is installed and `--dump-config` shows the layer, but a real boot says `failed to apply`** | `apply()` **reads the `ctx.whale` property** (in real Cordis, reading it requires `inject` ⇒ `cannot get property "whale" without inject`); `--dump-config` only composes the config tree and **never runs `apply()`**, so it cannot show this | Only write `ctx.provide('whale.xxx', x)` and fetch services at runtime with `ctx.get('whale.xxx')` — **never touch the `ctx.whale` property**; when verifying you **must really boot it once**; `--dump-config` does not count (all six packages fell into this on 2026-10-10) |
| You changed the code and nothing changed | ESM is cached by URL / `file:` installed a snapshot | Restart the engine + switch to a `link:` install |
| The engine will not start; the log shows one `ReferenceError` | A constant is not defined (we really did this) | Run the load-level self-test + the negative test |
| The recipient "did not receive it" | The other side **has no live session** | Normal: the letter **stays in the mailbox waiting for a person** and **is not lost** |
| The log writes one line every 4 seconds | The logging does not test for state changes | See rule 6 |

---

## 7. Three configurable behaviours (none of them is on unless you configure it; old deployments are unchanged)

All three take their **names from configuration** — the core **knows no concrete name** (this is criterion "E").

### 1) `offlineOnlyFlag` —— members who receive offline letters only

Some members **simply cannot receive an online letter** (for example, something that only lives next to you and has no resident session).
Give `bus` an **attribute name**:

```yaml
- id: whale-bus
  name: dsh-whale-post-bus
  config:
    root: '~/.dsh/whale-mail'
    offlineOnlyFlag: '<a name you choose>'      # ★the name is yours; the core does not know it
```

Behaviour: sending an **online** letter to such a member is **refused** (non-zero exit + **nothing written to the mailbox** +
no silent downgrade), and the message **shows the way out**: "resend with `--mode offline`".
**`--force` does not exempt it** — it is a **physical constraint** (they cannot receive online letters), not a "gate".
Sending to a **group** that contains one is **blocked just the same**.

### 2) `groupWithout` —— who broadcasts skip by default

```yaml
- id: whale-roster-json
  name: dsh-whale-post-roster
  config:
    file: '~/.dsh/whale-mail/roster.json'
    groupWithout: '<a name you choose>'          # ★broadcasts drop members carrying this attribute by default
```

Behaviour: a **broadcast** (`--to all`, and sending to a group) **drops** members carrying that attribute by default;
**addressing someone by name is unaffected** ("**broadcasts skip it, naming it gets through**").
An explicit `without: null` means "do not drop anyone this time".
If dropping leaves the group empty ⇒ **refused** (never post a letter with no recipients).

### 3) Two spellings for member attributes (pick either)

```json
{ "apiVersion": 1,
  "members": [ { "id": "alice" },
               { "id": "carol", "<attribute>": true } ],   ← ① on the member
  "groups": { "all": ["alice", "carol"] },
  "<attribute>": ["carol"] }                               ← ② or a top-level array of the same name
```

Both are accepted; falsy values (`false` / `0` / empty string) all count as "**does not carry it**".
