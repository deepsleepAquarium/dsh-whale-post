# dsh-whale-post-deliver

Delivery policy: an offline piece stays in the mailbox for someone to pick up / an online piece goes out right away (**a swappable hook point** —— example ①)

* Interface provided: `whale.deliver`
* Interfaces depended on: `whale.roster` (optional —— skip it if you do not need it)
* Self-test: `node selftest.mjs` (**look only at the exit code**: 0 pass / non-zero fail)

The interface carries `apiVersion`; the core knows no member name and no type identifier at all —— the roster and the types always come from the interface.

## It answers exactly one question (do not let it handle anything else)

**Does this letter go into the other side's session right now, or stay in the mailbox waiting for someone?** —— three states:

| Return | When |
|---|---|
| `'delivered'` | an online piece, and the other side **has a live session** ⇒ it really went out |
| `'kept'` | an offline piece; or an online piece where **the other side has no live session** ⇒ **neither delivered nor consumed** |
| `'rejected'` | the recipient is on the `blocked` list ⇒ the letter **does not enter its mailbox** |

## Interface

| Method | In one line |
|---|---|
| `deliver(letter, ctx)` | the answer to that question above; `ctx.targets` is given by the core (groups already expanded) |
| `blocked(id)` | is this recipient explicitly shut out |
| `sessionOf(id)` | is that session alive at this moment (the probe described below) |
| **`dormancyOf(id)`** | **`{ state, days, lastMs, source }`** —— **who is still awake** (see "Dormancy decision" below) |
| `log` | **a trace of the decisions** (for self-tests and troubleshooting) |

## Dormancy decision (S10 v2 —— ported from the class design document on 2026-10-10)

**The lesson from v1 (the design document's own words)**: "**you are not allowed to take "the postman is still alive" for "it is reading its letters"** —— a real round exposes it at once: **Xiao Maomi's postman renews `hello` for her every 10 minutes, but she herself does not read her letters** (what got measured was the postman, not her)"

So the decision runs **two paths**, **both carrying `source`, and an inference must never be stated as a declaration**:

| Path | Basis | `source` |
|---|---|---|
| **① declared** | the `declaredDormant(id)` given by configuration / that mark in the roster | `'declared'` |
| **② inferred** | **how long the oldest unread letter in its mailbox has been lying there** —— **that is hard evidence of "not reading letters"** | `'inferred'` |

**Four states**: **`awake`** (within `dormantSoftDays`) / **`quiet`** (soft～hard) / **`dormant`** (≥ hard) /
**`unknown`** —— **"we do not know"** —— **not "it is dormant"**

**Two hard rules**:
1. **No backlog ⇒ never rule dormant** ("**no letter to read ≠ not reading letters**" —— which is why the answer is `unknown`)
2. **Use the on-disk mtime only** (**do not trust timestamps inside the content** —— the disk has the final word on "when this letter arrived")

**Behaviour**: a recipient **declared dormant** ⇒ `deliver` returns `'rejected'` (**the same line as the core**:
**`--force` exempts nothing either**);
**merely `quiet` / `inferred` ⇒ never send back** (**do not guess dormancy on your own**).

## **The one wiring point for a real engine**: `sessionOf`

The core **knows no such concepts as "engine" or "session"** —— it recognises exactly one probe function:

```js
sessionOf(id) => ({ live: true, inject: (text) => { /* send this text into that session */ } })   // or undefined
```

Two ways to wire it (equivalent):
* `createBus({ probes: { sessionOf } })` —— feed it to the core directly;
* configure `sessionOf` on this piece —— the core picks up `services.deliver.sessionOf` automatically.

**Three rules (do not mix them up)**:
1. It **only affects whether an online piece can really go out** —— the probe says "no such session" (or no probe is wired at all) ⇒ an online piece is ruled `'kept'`:
   **the letter stays in `inbox/` waiting for someone** (**it arrives late at worst, never not at all**);
2. **`pump`'s authorisation to consume does not look at it** —— to consume you must supply `inject` or declare `reader: true`
   (**"the session is alive" ≠ "the letter reached the reader"**);
3. **if `inject` is supplied it will really be called, and if it throws ⇒ no consumption** —— a letter that cannot be handed over is never treated as handed over.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `sessionOf` | not wired | **that probe above** (not wired ⇒ an online piece is always ruled `'kept'`) |
| `blocked` | `[]` | **recipient ids explicitly shut out** (the letter does not enter their mailbox) |
| **`dormantSoftDays`** | `3` | **the day limit for "awake"** (past it ⇒ `quiet`) |
| **`dormantHardDays`** | `7` | **the threshold for "dormant"** (≥ it ⇒ `dormant`) |
| **`oldestPendingMs`** | not wired | **the probe for the inferred path**: `(id) => the on-disk time of the "oldest unread letter" in that inbox (ms; 0 ⇒ no backlog)`. **Not wired** ⇒ **report `unknown` truthfully** (**"do not know" means say you do not know**) |
| **`declaredDormant`** | not wired | **the declared-path probe**: `(id) => boolean` (**"who is marked dormant"** comes from the roster/configuration —— this piece knows no specific attribute name) |
| **`now`** | not wired | **injected clock** (for self-tests) |

## Swapping it out (this is what "hook point" means)

If you want a different delivery policy (say "send an online piece by SMS first, then deliver") ⇒ **replace only this piece**,
and the core and the other plugins **do not have to change a single line** (they only know the `deliver(letter, ctx)` interface).
