# dsh-whale-post-gate

Quota and billing gate + loopback gate (**a swappable hook point** —— example ②)

* Interface provided: `whale.gate`
* Interfaces depended on: `whale.types` (optional), `whale.roster` (optional, for counting "one group" as 1 unit)
* Self-test: `node selftest.mjs` (**look only at the exit code**: 0 pass / non-zero fail)

The interface carries `apiVersion`; the core knows no member name and no type identifier at all —— the roster and the types always come from the interface.

## Three gates + quota (each one states why)

**Offline pieces are exempt from the entire loopback gate** (ported on 2026-10-10 per the design document; design document criteria 29-31 + "**today's design target is 2026-10-06**"):
all three gates are there to stop "**waking someone up one time too many**" —— and **an offline piece wakes nobody at all** (it lies there waiting for the other side to come and collect it)
⇒ blocking it **buys nothing**, it only jams what the sender wanted to say in the sender's hands.
**This is exactly "a letter arrives late at worst, never not at all"**: what a "gate" should stop is **cost**, not **expression**.
⚠️ **Only the loopback gate is exempt** —— **the quota is unchanged** (the offline bucket is counted separately); **for online pieces everything is unchanged**.

| # | Gate | What it stops |
|---|---|---|
| ① | **Pure acknowledgement refused** | after blank space and punctuation are stripped, the body is **left with nothing but "received / ok / thanks"** ⇒ refused (an acknowledgement is supposed to be written automatically by the receiving side as an ack) |
| ② | **Same-pair loopback gate** | the same pair (you → the other side) has already sent `pairMax` letters within `pairWindowMs` ⇒ refused, **merge them into one letter first** |
| ③ | **Chain depth gate** | a letter carrying `re` recurses on the parent letter's `hop`, and at `hopMax` hops ⇒ refused (a chain has to land as a conclusion) |
| ④ | **Billing** | quota counted per bucket; **offline pieces counted separately** (by number of sends, 1 send = 1 item, **a group send does not multiply it**) |
| ⑤ | **Small daily cap for online pieces (S8)** | members like "the phone": **every online piece = waking it for one full-context inference** (the most expensive step) ⇒ capped by `min(<self-reported>, <ceiling>)`; **offline pieces are not subject to this cap**; `--force` **exempts nothing** |

## Interface

| Method | In one line |
|---|---|
| `check(letter, ctx)` | stop it or not: `'pass'` / `{ reject, reason }` |
| `record(letter, targets)` | **the ledger is written only after successful delivery** (a letter that was stopped takes no quota) |
| `report({ as, days })` | inspect the ledger (read-only) |
| `cfg` / `localDay()` / `quotaUnits()` | the effective configuration / the day boundary / "how many units this letter counts as" |

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `quota.onOver` | `'reject'` | `'reject'` **refuse to send** (non-zero exit code, the letter does not land in the mailbox) / `'price'` **send it anyway but bill it** ("the gate is a price gate, not a gag") |
| `quota.dayBoundaryHour` | `0` | day boundary: 0 = calendar day; write `9` = 9am to 9am the next day counts as one day |
| `quota.types` | `direct` 120 / `broadcast` 45 / `club` 60 / `offline` 80 | `limit` per bucket; **the offline bucket may take `perSend: true`** (counted by number of sends) |
| `quota.defaultLimit` | `120` | **a type that is not in the table** falls into this bucket (otherwise "register a new type" does not hold at the gate level) |
| `quota.bucketRules` | unset | **bucket rules** (an array): `[{ field, equals, bucket }]` —— **the first match from the top wins**; if `equals` is not written ⇒ "the field has a value, so it matches". **Field names and bucket names all come from the configuration** (no concrete name appears in this piece). Unset ⇒ the behaviour is unchanged to the letter (offline goes to `offline`, the rest follow `type`) |
| `now` **(top level)** | unset | **the clock is injectable**: supply a **finite number** (a pinned instant) or a **function** (`() => ms`) ⇒ **which day the ledger counts under is derived from it** (unset ⇒ real time). Why it is needed: rules like the "effective instant" ("before 09:00 the old accounting, only after that does bucketing start") **must be testable with a fake time** —— previously `Date.now()` sat bare everywhere ⇒ **they could not be tested** |
| `quota.defaultBucket` | unset | which bucket a letter falls into when no rule matched (meaningful only if `bucketRules` is set —— **it must be there**, otherwise "a letter carrying a new field" drops back to the type bucket) |
| `quota.phoneFlag` | unset | **who is "the phone"** (the attribute name comes from the configuration —— this piece knows no concrete name): a recipient carrying this attribute is **subject only to the small daily cap for online pieces**. Unset ⇒ this gate is **not enabled at all** |
| `quota.phoneOnlineCap` | `3` | **the ceiling**: the effective quota = **`min(<the onlineCapPerDay the recipient self-reports>, <this>)`** —— **"the receiving habit is declared by the recipient itself, and a declaration can only be more conservative"** (it can lower the cap to 1, **it cannot raise it above the ceiling**). No self-report ⇒ **use the ceiling** ("said nothing" ≠ "may be woken forever") |
| `loop.ackMaxBytes` | `40` | how long a body may be and still possibly count as an acknowledgement |
| `loop.ackOnly` | Chinese and English acknowledgement words | **recognise both Chinese and English** (recognising Chinese only ⇒ an English acknowledgement becomes a back door around the gate) |
| `loop.pairWindowMs` | `20 minutes` | the time window for same-pair loopback |
| `loop.pairMax` | `3` | the maximum number of letters the same pair may send within that window |
| `loop.hopMax` | `3` | the chain depth limit |

## Boundaries (two plain truths, so the next person does not take it for a security boundary)

* **The chain depth gate is not a security boundary** —— it relies on the replier **honestly carrying `re`**; without it, the chain resets. It is a **politeness gate / a rice-saving gate**.
* **`--force` bypasses all three gates wholesale** (this is **a deliberate escape hatch**), but it **leaves a trace**: the ledger counts `forced` for that day.
* **Nobody left after the group is filtered ⇒ refuse to send** (you run into this when the quota is counted per group —— better to refuse than to send a letter with no recipient).

## Swapping it out

If you want a different billing scheme (say billing by the byte, or no limit at all) ⇒ **replace only this piece**,
and the core and the other plugins do not have to change a single line (they only recognise those three: `check` / `record` / `report`).
