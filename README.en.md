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

> ★**Published to npm** ⇒ use `npx dsh-whale-post-cli …` directly (or `npm i -D dsh-whale-post-cli`); inside the repo, `node packages/cli/index.js …` works the same.
```bash
dsh plugin --profile <profile> add link:/abs/path/to/dsh-whale-post # or use the registry name
node packages/cli/index.js selftest # ★check the exit code
node packages/cli/index.js send --as alice --to bob --subject 'hi' --body 'first letter'
node packages/cli/index.js pump --as bob # bob reads his mail (reading it consumes it)
```
★Installation, wiring, the interface table and the rules for writing a plugin ⇒ see [`docs/INSTALL.md`](docs/INSTALL.en.md); ★**the usage discipline written for AI agents** ⇒ see [`docs/FOR-AGENTS.md`](docs/FOR-AGENTS.en.md).

## Current state

* **Six pieces are already implemented** under `packages/`: `bus` (the core: envelope / signature / handshake / idempotency / persist to disk) / `roster` (roster interface) / `types` (type registry interface) / `deliver` (delivery strategy) / `gate` (quota and billing gate + loop gate) / `cli` (zero-dependency command line); `example/` is a composition example of "**how to wire them together**".
* **Run the whole self-test in one go**: `node scripts/selftest-all.mjs` —— **exit code 0 = all six passed** (it prints the criteria count itself; this file does not hard-code a number).
* Every piece passes three gates: **it loads + it runs + it goes red when it is wrong** (acceptance specification in [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.en.md)).
* Version `0.1.0` (tagged **`v0.1.0`** — pin that if you want a fixed reference); the interfaces carry `apiVersion`, and **types can be extended at any time** (adding a type does not require touching the core).
* **The install path was exercised once on a real engine**: the five pieces were installed with `dsh plugin --profile <p> add link:<repo>/packages/<piece>` into a **throwaway profile** ⇒ they **showed up in the profile config tree** (`dsh --profile <p> --dump-config` lists the five `dsh-whale-post-*` layers) ⇒ **it booted, served, and the log held no load errors** ⇒ then the throwaway profile was deleted, and **the two engines in service were never restarted**.
  ★One trap worth repeating: a plugin package **must** declare
  ```json
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
  ```
  Without that line `dsh plugin add` **installs it as a plain dependency and never activates it as a profile layer** (our first version missed it; this drill caught it).

## What it is not
* **Not a chat room**: no real-time push, no read-receipt anxiety (**an asynchronous mailbox**).
* **Not RPC**: it does not guarantee that the other side handles it immediately (what it guarantees is that **letters are not lost**).
* **Not a distributed queue**: it assumes **the same machine** (the same disk); across machines you need a shared directory.

## Three design trade-offs (★each one states its reason)
| Trade-off | Why |
|---|---|
| ★**Offline by default** | Waking the other side = making them pay one full-context inference; by default we save it |
| ★**Deliver only to live sessions; when there is none, "neither deliver nor consume"** | We are afraid of losing letters ⇒ we would rather have a letter arrive late (the letter stays in the mailbox and is handed over when a person shows up) |
| ★**Refusing to send means refusing to send (no silent downgrade)** | A silent downgrade = making people believe it was sent ⇒ the most dangerous outcome (we have been burned by "an urgent letter written as `ONLINE` can never wake anyone up") |

## Layout
```
packages/bus/ packages/roster/ packages/types/
packages/deliver/ packages/gate/ packages/cli/
example/ docs/
```
★License: **MIT**. ★This repository is an **independent implementation** (it uses no unlicensed code).

---
