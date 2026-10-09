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
★**Two honest truths (we bought them with blood)**:
1. ★Installing a local package with `file:` = **copying a snapshot** ⇒ your source edits **do not take effect**; if you want to change the code, use `link:` (or a directory junction).
2. ★A running engine **caches ESM by URL** ⇒ **after changing code you must restart the engine** (restart even for a one-line change, otherwise you are testing the old code).

## 2. Minimal wiring (`cordis.patch.yml`)
```yaml
- insert:
 - id: whale-bus
  name: dsh-whale-post-bus
  config:
  root: '~/.dsh/whale-mail' # your choice; ★code default is ./.whale-mail (current dir)
  apiVersion: 1

 - id: whale-roster-json
  name: dsh-whale-post-roster
  config:
  file: '~/.dsh/whale-mail/roster.json' # the roster contents are filled in by you

 - id: whale-types-sample
  name: dsh-whale-post-types
  config:
  types: [direct, broadcast, club] # example types; register your own types yourself

 - id: whale-deliver
  name: dsh-whale-post-deliver # example ①: offline post office

 - id: whale-gate
  name: dsh-whale-post-gate # example ②: quota and billing gate
  config:
  quota: # ★NOTE: the gate reads config.quota.* —— the old `dailyUnits` here did nothing ✗
  onOver: reject # reject = refuse to send (non-zero exit) ／ price = send anyway, bill it
  types:
  direct: { label: 'direct', limit: 120 }
  offline: { label: 'offline', limit: 80, perSend: true } # ★offline is counted per send

 - id: whale-verify
  name: dsh-whale-post-verify # ★security check (envelope signature + allow-list)
  config:
  enabled: false # ★disabled by default; set true to enable (while disabled it nags you, for three days)
```
★**Wiring points**: the six plugins rely on each other **only through interfaces** (`ctx.whale.*`) ⇒ **the order in which they are written does not matter**; ★the core **does not know any names or types** —— you can replace the roster implementation or change the type table without touching a single line of the core.
★**Every quota number above is an example** ⇒ scale it to your own volume; extreme values (like `limit: 0`) will slam the gate shut immediately ✓.

### Where members come from (example roster file)
```json
{ "apiVersion": 1,
 "members": [ { "id": "alice", "label": "Alice" },
 { "id": "bob", "label": "Bob" } ] }
```
★`id` is the **mailbox directory name** used for delivery (`<root>/inbox/<id>/`); ★**the contents of the roster never enter the code**.

## 3. Is it installed or not

> ★**Six of the packages are already on npm** (`bus` / `roster` / `types` / `deliver` / `gate` / `cli`; ★the seventh, `verify`, is not published yet) ⇒ running **from inside the repo** is still the most reliable way (`node packages/cli/index.js …`). Once installed into a profile you can also call it by package name (`dsh-whale-post-cli`). (★criteria)
```bash
node packages/cli/index.js selftest # ★look only at the exit code: 0 = pass; non-zero = fail (do not read the Chinese)
node packages/cli/index.js send --as alice --to bob --subject 'hello' --body 'first letter'
node packages/cli/index.js pump --as bob # read through bob's mailbox once (★this consumes the letters)
```
★**Three hard rules**: ① **look only at the exit code** (do not match on the Chinese text); ② **it can be re-run in place** (two runs give the same result); ③ ★**negative test**: **deliberately break one line ⇒ the self-test must turn red** (not turning red = the self-test is decoration).

★**The runner that ships with this repository** (you can verify it before installing anything): `node scripts/selftest-all.mjs` ⇒ **exit code 0 = all six passed**; to run a single piece, `node packages/<package-name>/selftest.mjs`.
★**From npm** (published): `npm i dsh-whale-post-cli` ⇒ `npx dsh-whale-post-cli selftest`.

★★**Collecting mail (important — do not skip)**: `pump` **consumes by default** (it moves letters into `seen/` and writes an ack) — **but** when the recipient has **no live session** right now and nothing has declared itself a reader, `pump` **consumes nothing**: letters stay exactly where they are in `inbox/` (not moved to `seen/`, not unlinked, no ack written).
★To keep undeliverable mail in the mailbox, use `keep`: `keep: true` (look but do not consume) or `keep: (letter) => boolean` (decide per letter); from the command line, pass `--keep`. ★To consume, you have to **declare yourself a reader**: `reader: true` (that is what the CLI does when it prints letters to the terminal).
★This is the **receiving half** of "**mail may arrive late, but it never goes missing**" — without it, letters get silently eaten while the recipient is away.

★★**The one wiring point for a real engine: the `sessionOf` probe (read this before you wire anything up)**
★The core **does not know about "engines" or "sessions"** — it only knows one probe function:
```js
sessionOf(id) => ({ live: true, inject: (text) => { /* deliver this text into that session */ } })   // or undefined
```
★Two equivalent ways to wire it:
* `createBus({ probes: { sessionOf } })` — hand it straight to the core;
* configure `sessionOf` on `dsh-whale-post-deliver` — the core picks up `services.deliver.sessionOf` automatically.

★Three rules (do not mix them up):
1. ★**It only decides whether an online letter can actually be handed over** — if the probe says "no such session" (or nothing is wired), the online letter is judged **`kept`**: **it stays in `inbox/` and waits** (**late, never lost**);
2. ★**`pump`'s permission to consume does NOT consult it** — consuming requires `inject` or an explicit `reader: true` (**"the session is alive" ≠ "the letter reached a reader"**);
3. ★**If you pass `inject`, it is really called; if it throws, nothing is consumed** — a letter that cannot be handed over is never treated as handed over.

## 4. Packages and interfaces at a glance
| Package | Role | Interfaces provided / used |
|---|---|---|
| `dsh-whale-post-bus` | Core: envelope / digest + HMAC signature / handshake / idempotency / persist to disk | provides `ctx.whale.bus` |
| `dsh-whale-post-roster` | **Who receives** (the interface piece + a sample that reads JSON) | provides `ctx.whale.roster` |
| `dsh-whale-post-types` | **What type a letter is** (the interface piece + a sample) | provides `ctx.whale.types` |
| `dsh-whale-post-deliver` | **Delivery strategy** (= the hook point of example ①) | uses `bus` / `roster` |
| `dsh-whale-post-gate` | **Gate** (= the hook point of example ②) | uses `bus` / `types` |
| `dsh-whale-post-verify` | **Security check** (envelope signature + allow-list), ★disabled by default | uses `bus` (optional: borrows its `digest` / `sign`) |
| `dsh-whale-post-cli` | Entry-point tool (★**not a plugin**) | uses `bus` |
| `example/` | Composition example: a minimal `cordis.patch.yml` + the criteria for one run | everything |

★The minimal method set of the interfaces (★**carries `apiVersion`**; types may be extended at any time):

| namespace | Methods |
|---|---|
| `ctx.whale.bus` | `send(letter)` / `pump({ as, keep })` / `verify(letter)` |
| `ctx.whale.roster` | `list()` / `has(id)` / `label(id)` |
| `ctx.whale.types` | `register(id, meta)` / `resolve(id)` / `list()` |
| `ctx.whale.deliver` | `deliver(letter, ctx)` → `'delivered'` / `'kept'` / `'rejected'` |
| `ctx.whale.gate` | `check(letter, ctx)` → `'pass'` / `{ reject, reason }` |
| `ctx.whale.verify` | `verify(letter)` → `{ ok, why?, skipped? }` / `nag()` → `string \| null` / `status()` / `enable()` / `disable()` |

## 5. ★Rules for writing a plugin (follow them; do not step in the pits we fell into)
1. ★**Know interfaces, not names**: the core code must not hard-code **any** member name / type identifier / internal path (rosters and types are always registered in).
2. ★Shape: `export const name = '...'` + `export function apply(ctx, config = {})`.
3. ★**Zero I/O and zero side effects at the top level**: at the moment the module is `import`ed it must not read from disk, must not send letters and must not start timers (put everything inside `apply`).
4. ★**Do not use `inject`** (when it is not satisfied it **hangs silently**, and you will not even see a log line) ⇒ instead **fetch the service at runtime**: `ctx.get('whale.bus')`.
5. ★**A missing service must not blow up**: if you cannot get it, log a line and **try again on the next tick** (a plugin loading before its service is registered is the normal case).
6. ★**Log only when the state changes**: otherwise you get one line per tick and the log turns into a waterfall (we really did flood it once).
7. ★**Swallow your own exceptions**: never throw an exception back into the engine (one error that escapes can take the whole engine down).
8. ★**Everything is configurable**: root directory / interval / signer name / paths all come from `config`; do not hard-code them in the code.
9. ★**Carry `apiVersion`**: both type identifiers and the envelope format reserve a version slot ("extensible at any time" is a hard requirement).
10. ★**Atomic persist to disk**: write a temporary file + `rename` (a half-written file = one fake hang).
11. ★★**The signature must cover every semantic field**: leaving one field unsigned (for example `mode` / priority) = someone else can silently rewrite it (★this is exactly the hole we closed with "`mode` goes into the signature too").
12. ★**Idempotent**: the same letter is consumed only once (deduplicated by message id); ★a replay must not deliver twice.
13. ★**Offline by default**: waking the other side requires an **explicit** `online` —— ★do not let "online by default" flood someone else's session.
14. ★**Before handing in**: a **load-level self-test** + `selftest` turning green + **one real launch to check the log for load errors** —— ★passing syntax and passing module-level self-tests **do not count** (this is exactly how we went down: 7 entry points all crashed on the same line).

## 6. Common failures
| Symptom | Most likely cause | What to do |
|---|---|---|
| The plugin is installed but "does nothing" | You used `inject` / you fetched the service at the top level | Fetch the service at runtime + retry every tick |
| ★**It is installed and `--dump-config` shows the layer, but a real boot says `failed to apply`** | ★`apply()` **reads the `ctx.whale` property** (in real Cordis, reading it requires `inject` ⇒ `cannot get property "whale" without inject`); ★`--dump-config` only composes the config tree and **never runs `apply()`**, so it cannot show this | ★Only write `ctx.provide('whale.xxx', x)` and fetch services at runtime with `ctx.get('whale.xxx')` —— **never touch the `ctx.whale` property**; ★when verifying you **must really boot it once**; `--dump-config` does not count (all six packages fell into this on 2026-10-10 ✗) |
| You changed the code and nothing changed | ESM is cached by URL / `file:` installed a snapshot | Restart the engine + switch to a `link:` install |
| The engine will not start; the log shows one `ReferenceError` | A constant is not defined (we really did this) | Run the load-level self-test + the negative test |
| The recipient "did not receive it" | The other side **has no live session** | Normal: the letter **stays in the mailbox waiting for a person** and **is not lost** |
| The log writes one line every 4 seconds | The logging does not test for state changes | See rule 6 |

---

## 7. ★Three configurable behaviours (★none of them is on unless you configure it ✓; old deployments are unchanged ✗)

★All three take their **names from configuration** —— ★the core **knows no concrete name** ✓ (this is criterion "E").

### 1) `offlineOnlyFlag` —— members who receive offline letters only

★Some members **simply cannot receive an online letter** (for example, something that only lives next to you and has no resident session).
Give `bus` an **attribute name**:

```yaml
- id: whale-bus
  name: dsh-whale-post-bus
  config:
    root: '~/.dsh/whale-mail'
    offlineOnlyFlag: '<a name you choose>'      # ★the name is yours; the core does not know it
```

★Behaviour ✓: sending an **online** letter to such a member is **refused** (non-zero exit + **nothing written to the mailbox** +
no silent downgrade), and the message **shows the way out**: "resend with `--mode offline`" ✓.
★**`--force` does not exempt it** ✗ —— it is a **physical constraint** (they cannot receive online letters), not a "gate".
★Sending to a **group** that contains one is **blocked just the same** ✓.

### 2) `groupWithout` —— who broadcasts skip by default

```yaml
- id: whale-roster-json
  name: dsh-whale-post-roster
  config:
    file: '~/.dsh/whale-mail/roster.json'
    groupWithout: '<a name you choose>'          # ★broadcasts drop members carrying this attribute by default
```

★Behaviour ✓: ★a **broadcast** (`--to all`, and sending to a group) **drops** members carrying that attribute by default;
★★**addressing someone by name is unaffected** ✗ ("**broadcasts skip it, naming it gets through**" ✓).
An explicit `without: null` means "do not drop anyone this time" ✓.
★If dropping leaves the group empty ⇒ **refused** (never post a letter with no recipients ✓).

### 3) Two spellings for member attributes (★pick either ✓)

```json
{ "apiVersion": 1,
  "members": [ { "id": "alice" },
               { "id": "carol", "<attribute>": true } ],   ← ① on the member
  "groups": { "all": ["alice", "carol"] },
  "<attribute>": ["carol"] }                               ← ② or a top-level array of the same name
```

★Both are accepted ✓; ★falsy values (`false` / `0` / empty string) all count as "**does not carry it**" ✓.
