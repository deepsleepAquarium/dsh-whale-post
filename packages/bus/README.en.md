# dsh-whale-post-bus

> 中文: [bus README（中文）](https://github.com/deepsleepAquarium/dsh-whale-post/blob/main/packages/bus/README.md)

Core: envelope / digest + HMAC signature / handshake / idempotency / persist to disk

* Provides the interface: `whale.bus`
* Depends on the interfaces: `whale.roster`, `whale.types`, `whale.gate`, `whale.deliver`, `whale.verify`
  (**all optional** —— when one is missing it falls back to a built-in sample / skips that policy, and it never writes the roster into the core)
* Self-test: `node selftest.mjs` (**look only at the exit code**: 0 pass / non-zero fail)

The interfaces carry `apiVersion`; the core knows no member name and no type identifier —— the roster and the types always come from the interfaces.

## The three questions it answers (each one says why)
1. **The core knows no names and no types** —— the roster and the types always come from the interfaces; with no interface it falls back to a built-in sample.
2. **Offline by default** —— offline = the letter stays in the other side's mailbox and waits for someone to collect it; online = it goes out right away (which means waking the other side).
   **A wrong `mode` value is always refused**; a silent downgrade is not allowed ("an urgent letter written as `ONLINE` can never wake anyone up" —— we have been burned by that accident).
3. **Deliver only to live sessions; when there is none, neither deliver nor consume** —— the other side has no live session ⇒ the letter **stays in the mailbox exactly as it is**
   ⇒ **a letter only arrives late, never not at all**.

## Interface

| Method | In one sentence |
|---|---|
| `send(letter)` | send one: `{ as, to, subject, body, mode, type, re, force }`; a refusal **throws** (in the CLI = a non-zero exit code) |
| `pump({ as, keep, inject, reader })` | receive (see "receive semantics" below) |
| `verify(letter)` | check the envelope for problems, returns the **array of problems** (empty = no problem) |
| `hello({ as })` | handshake; writes `hello/<as>.json` |
| `format(env)` | render an envelope as human-readable text |
| `paths()` / `root()` / `keyHex()` / `digest(s)` / `seal(f)` / `sign(env)` / `loadState(as)` | low-level parts (used by the self-test, tools and the gate) |

## Receive semantics (the part most easily misunderstood)

`pump` **consumes by default** (moves the letter into `seen/` + writes an ack) —— **but when the recipient has no live session at that moment and nothing declares "I am the reader", it consumes not a single letter**:
The letter **stays in `inbox/` exactly as it is** (nothing moves to `seen`, the original is not deleted, no ack is written).

| `keep` | Behaviour |
|---|---|
| not passed | **no reader ⇒ nothing is consumed** (the default) |
| `true` | read only, do not consume |
| `false` | consume explicitly |
| a function `(letter) => boolean` | decide letter by letter |

Also: `reader: true` ⇒ **an explicit declaration that "I am the reader"** (that is what the CLI does when it prints a letter to the terminal);
if you pass `inject` it really is called, and **if it throws ⇒ nothing is consumed** (**a letter that cannot be handed over is never treated as handed over**).

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `root` | `WHALE_POST_ROOT` ⇒ `./.whale-mail` | mailbox root (**this is where letters land**) |
| `keyFile` | `<root>/signing.key` | signing key (32 bytes generated automatically on first use) |
| `maxBody` | `64 KiB` | body size limit |
| `requireHello` | `true` | **three states**: **the default `true` = send anyway + say plainly "downgraded to offline"** (see "handshake" below); `false` = **no check**; **`'reject'` = the old "refuse to send"** (write it if an old deployment wants the old behaviour). **offline letters never look at the handshake at all** |
| `helloMaxAgeMs` | `24 hours` | how old a handshake may be before it counts as expired |
| `helloClockSkewMs` | `60 seconds` | **clock tolerance**: how far ahead of "now" a `hello`'s `sentAtMs` may be and still **not count as the future** (machines being a few seconds off is common). **Any timestamp in the future is judged not fresh** (design document S6h-④: otherwise **forging a hello dated 2099 would make the handshake gate meaningless**; fail-safe: **a wrong judgement may only lean towards offline**) |
| `defaultType` | `'direct'` | set it to `null` ⇒ **a letter with no type is refused outright** (we do not guess for the caller) |
| `offlineOnlyFlag` | unset | **three states**: unset ⇒ not enabled; set to an attribute name ⇒ **send anyway + say so via `wakePrediction.offlineOnly`** (design document criteria 58-62: **no more refusal** —— "if you cannot wake them, leave it in the box and wait, but say so loudly"); `offlineOnlyMode: 'reject'` ⇒ **the old refusal** |
| `dormantFlag` | unset | for a member **explicitly marked dormant** ⇒ **bounce** (S11): **it does not land in their mailbox** / **it goes into the class `退信/`** (**not deleted**) / **a `*.why.txt` note is left** / the result says `verdict: 'bounced'` plus the `bounced` list, **plainly** / **it takes no quota** (it returns before `gate.record`). **Never guess dormancy yourself from "how long since their last hello"**. Only partially dormant (a send to a group) ⇒ deliver only to the awake ones + `skippedDormant` |

## Structured receipts (added 2026-10-10 per the design document: today's design target is 2026-10-06 01:5x)

**One receipt says two things clearly** (design document criteria 87-90):

| Field | What it says |
|---|---|
| **`recipientState`** | **my (the recipient's) state at that moment** —— `online` / `stale-online` / `offline` ("am I online" = **how fresh the `hello` I sent out myself is**) |
| **`disposition`** | **where this letter went** —— see the table below |

| `disposition` | When |
|---|---|
| `accepted-online` | **accepted while online** |
| `delivered-offline-by-stale` | **the sender did not get a fresh `hello` from me** ⇒ delivered as offline |
| `delivered-offline-by-declaration` | **I had declared "offline only"** ⇒ this **online letter** is delivered as offline |
| `delivered-offline` | **it was an offline letter to begin with** ("downgrade" only means something for online letters) |
| `refused` | **refused** (written on the "signature verification failed" path) |

**`disposition` prefers the delivery note the sender wrote down** (the design document's own words: "that is **how it was judged at the time**") ——
so the envelope carries a `deliveryNote` (`'offline-only'` / `'no-handshake'`): **what the sender wrote down must travel with the letter**,
`mode` alone cannot tell you **why** it went offline.

Two more fields: `by` (**who replied**) / `ok` (`true`; `false` when refused) / `note` (an explanation).
**Each ack writes its own file** (`<id>.<by>.ack.json` —— with a broadcast, several receiving ends do not collide).
## Handshake (changed 2026-10-10 per the design document: **no handshake no longer means refusing to send**)

**Design document criteria 1-3 + "today's design target is 2026-10-06 01:5x"**: **"if you cannot wake them, leave it in the box and wait, but say so loudly"**
**Why "refusing to send" is wrong**: "refusal" is the **earlier** version —— and it is **backwards**: the letter **never went out at all**,
while the sender believes "the protocol does not allow sending" —— **that is at odds with "a letter only arrives late, never not at all"**.

| `requireHello` | Behaviour |
|---|---|
| **any other truthy value (the default `true`)** | **send anyway + say plainly "downgraded to offline for them"** —— in the return value `wakePrediction.willWait` lists the people who "**cannot be woken and will have their letter waiting in the box**" (**no silence allowed**) |
| `false` | **do not check the handshake** (and do not disclose anything either) |
| **`'reject'`** | **the old "refuse to send"** (write it if you want the old behaviour ⇒ **an old deployment changes not one character**) |

**Three accompanying rules**: ① **an offline letter never looks at the handshake at all** (an offline letter lies there waiting for someone, and the handshake has no say over it);
② **someone who has shaken hands must not appear in `willWait`** (do not raise false alarms); ③ `--force` skips the check as before.

## Envelope and signature (follow this if you want to implement an end yourself)

* **The signature domain** (`FIELD_ORDER`): `v, kind, id, from, to, seq, subject, body, sha256, sentAtMs, type, mode, re, hop`
  **`mode` is in there too** (sign without it ⇒ someone can change it from offline to online).
* **fail-closed in both directions**: `seal()` **throws** on an **unregistered field**; `verify()` **refuses** on an unregistered field
  ("adding a field and forgetting the signature domain" = that field can be changed at will and verification still passes).
* **Fields that are known but retired** (`LEGACY_FIELDS`, learned on 2026-10-10 from **real letters** in the shared post-office root):
  the class's setup **really did write `auth` into envelopes** during its transition period (the later decision was "bucket assignment looks only at `mode`, not at `auth` ⇒ the envelope format changes not one character"),
  so those historical letters are **judged "not in the signature domain" and bounced outright** by us —— our implementation **really did bounce three of them** in the shared root.
  The rule: **old letters pass (treat them as history), new letters stay fail-closed** —— `seal()` **still refuses `auth`**,
  while `verify()` lets it through (**it has no semantics left ⇒ changing it achieves nothing**); **any other unknown field is still refused**.
* **Persisting always goes to `.tmp` first, then `rename`** (**a half-written file = one fake hang**, we have been burned by this one).
* **Idempotency relies on the `seen/` directory itself** (the state array gets truncated / lost; relying on the array alone ⇒ re-sending the same letter delivers it a second time).
* **Sequence numbers are handed out after the gate** (a refused letter must not burn a sequence number ⇒ the watermark matches the real volume of letters sent).
* **An old letter with no `mode` ⇒ treated as "online"** (do not smother old letters).

## Boundaries (written down so nobody mistakes them for guarantees)

* **It knows no names at all** ⇒ **if a provider lies, the core cannot stop it** (this is a deliberate design choice ⇒ if you want protection, add validation in the provider layer).
* **Concurrent sequence claiming: tested** (2026-10-10) —— `node scripts/racetest.mjs`: **12 real sub-processes calling `send` at the same time** ⇒
  **all exit codes 0 + 12 letters delivered + every `seq` unique (1..12)**; it also replays "the `state` file written backwards" (write `nextSeq` back to 1
  ⇒ a new letter still gets a **new number**, because the **watermark** `state/<as>.seq` is the fallback).
  Negative test: **short-circuit the whole claiming mechanism** (pure "read-modify-write") ⇒ **24 processes, 3 rounds, a collision in every round** (unique `seq` 8 / 7 / 8).
  **The truncation path: tested** (moved from "not tested" to "tested" on 2026-10-10) —— the `seen/` directory itself
  is the permanent evidence (the state array gets truncated by `slice(-2000)`); the criterion **empties** the array,
  then puts the same letter **back into the mailbox** ⇒ **it must still be judged a duplicate**; the negative proof: drop only the
  `existsSync` branch ⇒ the criterion goes red immediately.
* **It only solves "the same machine"** —— the mailbox is a directory on disk; across machines you need a shared directory.
