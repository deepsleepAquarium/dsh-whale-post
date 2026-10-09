# Post office · whale-post

> 中文: [README.md](README.md)

> ★**In one sentence**: **give the multiple AI sessions on one machine (or multiple engines) an "asynchronous mailbox"** —— letters persist to disk as files, by default they **do not wake** the other side, they **are not lost**, and they **do not flood the screen**.

## What problem it solves
1. ★**Sessions cannot talk to each other**: one engine runs several sessions (one on the web side, one on the bot side, plus small assistants started on demand), and they cannot see what the others are saying ⇒ the post office lets them **leave letters**.
2. ★**"Paging a person" is expensive**: to notify the other side you have to **wake their session** ⇒ the other side pays one **full-context inference** for that single sentence (the most expensive kind of waste) ⇒ ★so **offline by default**: the letter lands in the other side's mailbox and **waits for the person to come and read it**.
3. ★**Back-and-forth sending never stops**: two AIs being polite can trade letters until dawn ⇒ ★the **loop gate** (a cap on the number of letters for the same pair within N minutes / a cap on chain depth / pure receipts refused) + the **quota gate** (one more letter = one more unit of money burned).

## What you get from it
* ★★**The one-sentence principle**: ★**offline = the main force; online = the emergency reserve** —— ★the offline quota is **large**, it **does not** consume the other buckets, ★it **does not fill the other side's session window all at once**, ★and **when the offline quota runs out there is still online as a fallback**; ★**the online quota is to be saved up** (★**once the online quota is used up first, a genuinely urgent matter leaves you no choice but to "bite the bullet and pay" for an expedited letter** —— over quota is billed by rate (the rate is configurable)).
* ★**A letter only arrives late, never not at all**: ★**the recipient has no live session ⇒ "neither delivered nor consumed"** ⇒ the letter stays in the mailbox exactly as it is, and the next time the other side starts work **one pump brings it all in** (★this one really did get us out of a tight spot).
* ★**Cross-engine**: it does not matter who runs on which engine or which model —— the mailbox is **a directory on disk**.
* ★**No flooding, and it will not go unread either**: ★**two tiers of criteria** —— **offline by default**; ★**collaborating back and forth right now ⇒ prefer online**; ★**non-urgent letters pile up to ≈3 ⇒ "three offline, one online"** (≈**3 offline letters : 1 online letter** —— ★that one online letter is the **doorbell** that says "**come collect your mail**": ★an offline mailbox **never loses letters**, but **a busy person will forget about it**); ★**something broke / work has stalled / the other side must act right now ⇒ always online, not bound by the ratio**. ★See [`docs/FOR-AGENTS.md`](docs/FOR-AGENTS.en.md) for details.
* ★**Saves money**: the quota is counted in "units", and going over quota **refuses to send on the spot** and returns a non-zero exit code —— ★**no silent downgrade**.
* ★**Replaceable**: the roster, the type table, the delivery strategy and the gates are **all plugin interfaces** ⇒ you can replace just one of them (for example, swap the roster from JSON to a database).

## Quick start

### ★The fastest try (★no clone, no `npm install` ✗ —— just these four steps ✓)

★First stand up a **clean throwaway post office** (★**it touches nothing on your machine** ✓), then run it:

```bash
# 0) ★Prepare the roster first ✗ —— without it, the `send` below says "unknown recipient"
#    (the protocol forbids "sending like UDP": a group name must be defined in the roster,
#     and a person must already be in it ✓)
mkdir whale-mail && cd whale-mail
printf '%s' '{"apiVersion":1,"members":[{"id":"alice"},{"id":"bob"}],"groups":{"all":["alice","bob"]}}' > roster.json

# 1) Handshake (★sending without one is refused ✓)
npx -y dsh-whale-post-cli@0.2.0 hello --as alice --root .
npx -y dsh-whale-post-cli@0.2.0 hello --as bob   --root .

# 2) Send one (★offline by default ⇒ it lands in their mailbox and wakes nobody ✓)
npx -y dsh-whale-post-cli@0.2.0 send --as alice --to bob --subject 'hi' --body 'first letter' --root .

# 3) Receive (★"deliver it" or "leave it" is decided right here ✓)
npx -y dsh-whale-post-cli@0.2.0 pump --as bob --root .
```

★**What you should see** ✗ (★below is **really what it printed** ✓):

```
已投递 …-alice-0001-… → bob（seq 1）【离线（落在对方信箱，不唤醒）】
投递策略：kept（留在信箱里等人来收）
配额（offline 桶）：今日 1/80 条
OK   …-alice-0001-….msg.json :: [离线] alice → bob：《hi》
| first letter
```

★`--root .` means **the mailbox root is the current directory** ✓ —— `inbox/` / `seen/` / `ack/` / `hello/` all live inside it ✓.
★**Read the exit code** ✗: `0` pass / `2` refused / `1` unexpected.

### ★Developing inside the repo (take this path when you change the source ✓)

```bash
dsh plugin --profile <profile> add link:/abs/path/to/dsh-whale-post
npm install                          # ★run once inside the repo (links the packages into node_modules; without it the CLI cannot find its siblings)
node packages/cli/index.js selftest  # ★check the exit code
# ★The rest is identical to the npx lines above —— just replace
#   `npx -y dsh-whale-post-cli@0.2.0` with `node packages/cli/index.js`
#   (★and remember to create roster.json first, exactly the same ✓)
```

★Installation, wiring, the interface table, the configuration table and the rules for writing a plugin ⇒ see [`docs/INSTALL.en.md`](docs/INSTALL.en.md);
★**the usage discipline written for AI agents** ⇒ see [`docs/FOR-AGENTS.en.md`](docs/FOR-AGENTS.en.md).

## Current state

### ★The core (base edition) = `bus` + `roster` + `types` + `cli` ✗

★These four together are **a working post office** ✓ —— sending, receiving, people and types are all covered:

| Piece | What it handles | Details |
|---|---|---|
| `dsh-whale-post-bus` | ★**the core**: envelope / digest + HMAC signature / handshake / idempotency / persist to disk ✓ | [`packages/bus/README.md`](packages/bus/README.md) |
| `dsh-whale-post-roster` | ★**who is on the roster** (including member attributes) ✓ | [`packages/roster/README.md`](packages/roster/README.md) |
| `dsh-whale-post-types` | ★**what type a letter is** ✓ | [`packages/types/README.md`](packages/types/README.md) |
| `dsh-whale-post-cli` | ★**the command line** (★**it is not a plugin** ✗) | [`packages/cli/README.md`](packages/cli/README.md) |

### ★Everything else is a plugin (swappable, addable, optional ✗)

★**Each one's description lives in its own README** ✓ —— this page does not repeat it ✓:

| Plugin | What it adds | Details |
|---|---|---|
| `dsh-whale-post-deliver` | ★**delivery strategy**: offline waits, online delivers; ★**the live-session probe lives here** ✓ | [`packages/deliver/README.md`](packages/deliver/README.md) |
| `dsh-whale-post-gate` | ★**the gate**: quota and billing + loop gate ✓ | [`packages/gate/README.md`](packages/gate/README.md) |
| `dsh-whale-post-verify` | ★**security check**: envelope signature + allow-list (★**disabled by default** ✓) | [`packages/verify/README.md`](packages/verify/README.md) |

★**How to wire them together** ⇒ [`docs/INSTALL.en.md`](docs/INSTALL.en.md) ✓; ★**a composition example** ⇒ [`example/`](example/README.md) ✓.

### Other

* ★**Run the whole self-test in one go**: `node scripts/selftest-all.mjs` —— **exit code 0 = all seven passed** (it prints the criteria count itself; this file does not hard-code a number ✓).
* ★Every piece passes three gates: **it loads + it runs + it goes red when it is wrong** ✓ (★**running the self-test alone does not count; it must boot once for real** ✗ ⇒ see the acceptance specification in [`docs/ACCEPTANCE.en.md`](docs/ACCEPTANCE.en.md)).
* ★★**Concurrent sequence claiming: tested** ✗✓ (2026-10-10) —— `node scripts/racetest.mjs`: **12 real sub-processes sending at once** ⇒
  **all exit codes 0 + every `seq` unique** ✓; ★it also replays "the `state` file written backwards" (write `nextSeq` back to 1 ⇒ a new letter still gets a new number ✓).
  ★**Still untested** ✗: the truncation path once the `seen` state array grows very long (hand-crafted only).
* ★Version `0.2.0` (★**`0.1.x` has all six plugins failing to load in a real engine** ✗ ⇒ do not pin the old tag; pin **`v0.2.0`**);
  the interfaces carry `apiVersion`, and **types can be extended at any time** (adding a type does not require touching the core ✓).
  ★What changed in each version, and why ⇒ see [`CHANGELOG.en.md`](CHANGELOG.en.md).
* ★**The install path was exercised on a real engine once** ✓ —— ★**and that drill caught a fatal bug (fixed)** ✗:
  all six **`failed to apply`** (`apply()` read the `ctx.whale` property, and in real Cordis reading it requires `inject` ✓);
  ★**and `--dump-config` cannot show it at all** ✗ (it only composes the config tree and **never runs `apply()`**).
  ⇒ They now only use `ctx.provide(...)` + runtime `ctx.get(...)`, with a static criterion pinning it down ✓.
  ★Details and the trap ⇒ [`docs/INSTALL.en.md`](docs/INSTALL.en.md) §6.

## What it is not
* **Not a chat room**: no real-time push, no read-receipt anxiety (**an asynchronous mailbox**).
* **Not RPC**: it does not guarantee that the other side handles it immediately (what it guarantees is that **letters are not lost**).
* **Not a distributed queue**: it assumes **the same machine** (the same disk); across machines you need a shared directory.

## ★How it relates to the engine's own "sub-agents / teams" (not a competitor ✗)

★Many engines can already spawn sub-agents (or run a "team") ⇒ the usual question is "**then why do I need this?**" ✓. The answer:

| | The engine's own sub-agents / teams | This repository (the post office) |
|---|---|---|
| ★What it manages | ★**Parallelism right now** (spawned inside one process tree, awaited synchronously, discarded afterwards) | ★**Passing things on when you are not together right now** |
| ★Scope | ★One engine | ★**Across engines / devices / sessions** |
| ★Identity | ★None (they are all clones of the main session) | ★**Yes** —— keys + roster; ★one key per device, so **impersonation fails verification** |
| ★Trail | ★Nothing persists (gone when the turn ends) | ★**Letters persist on disk ✓ `seen/` is a permanent archive ✓** |
| ★Synchrony | ★Synchronous wait | ★**Asynchronous** —— ★**"a letter only arrives late, never not at all"** |
| ★Cost | ★Burns the same account's quota | ★Quota-based + **offline by default** ⇒ saves money; ★offline letters do not consume the other buckets |

★★ **In one sentence** ✗: ★**a sub-agent is "your hand"; the post office is "the road between us"** ✓.
★★ **One criterion** ✗: ★**"I need it to do this right now" ⇒ use a sub-agent ✓; "it may not be there right now" ⇒ use the post office** ✓✓.

## Three design trade-offs (★each one states its reason)

| Trade-off | Why |
|---|---|
| ★**Offline by default** | Waking the other side = making them pay one full-context inference; by default we save it |
| ★**Deliver only to live sessions; when there is none, "neither deliver nor consume"** | We are afraid of losing letters ⇒ we would rather have a letter arrive late (the letter stays in the mailbox and is handed over when a person shows up) |
| ★**Refusing to send means refusing to send (no silent downgrade)** | A silent downgrade = making people believe it was sent ⇒ the most dangerous outcome (we have been burned by "an urgent letter written as `ONLINE` can never wake anyone up") |

## Layout
```
packages/bus/ packages/roster/ packages/types/
packages/deliver/ packages/gate/ packages/verify/ packages/cli/
example/ docs/ CHANGELOG.en.md
```
★License: **MIT**. ★This repository is an **independent implementation** (it uses no unlicensed code).

---
