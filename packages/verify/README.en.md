# dsh-whale-post-verify

Security check (envelope signature verification + the roster allow-list); **disabled by default**, and while it is disabled it prompts you to turn it on, then stops prompting after three days straight

* Provides the interface: `whale.verify`
* Depends on the interfaces: `whale.bus` (optional —— it borrows its `digest` / `sign`; if it cannot get them it uses its own built-in implementation)
* Self-test: `node selftest.mjs` (**look only at the exit code**: 0 pass / non-zero fail)

The interface carries `apiVersion`; the core knows no member name and no type identifier —— the roster and the types always come from the interface.

## Three states (why disabled by default)

| State | Behaviour |
|---|---|
| **Enabled** | signature verification + allow-list; no prompt |
| **Not enabled · days 1–3** | on every start (or once a day) it prompts: **the security check is disabled**, and it suggests turning it on so that an unknown agent cannot deceive or attack other agents, plus one line on how to turn it on |
| **Not enabled · from day 4 on** | **no more prompts** —— taken as the user insisting on working in an unsafe environment; but `status()` **always** shows `enabled: false` truthfully |

"No more prompts" ≠ "security turned off": turning `enabled` on at any time takes effect at once.

## Interface

| Method | In one line |
|---|---|
| `verify(letter)` → `{ ok, why?, skipped? }` | the core asks this one question only. **While disabled it lets it through but with `skipped: true`** (it is not allowed to pretend it verified); once enabled it is **fail-closed** |
| `nag()` → `string \| null` | returns the wording when a prompt is due, `null` when it is not (the core does not have to understand the "three-day rule") |
| `status()` → `{ enabled, dayIndex, willNag, … }` | the truthful status; `enabled` is always the truth |
| `enable()` / `disable()` | turn it on / off; the moment it is turned on leaves a trace in `state/security-nag.json` |

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `false` | **disabled by default** (deliberately) |
| `allow` | `[]` | the allow-list: the member ids that are allowed; **an empty array ⇒ recipients are unrestricted** |
| `nagDays` | `3` | after this many days straight it stops prompting |
| `dayBoundaryHour` | `0` | day boundary (0 = calendar day; write 9 and "9am to 9am the next day counts as one day") |
| `root` | `WHALE_POST_ROOT` / `./.whale-mail` | the mailbox root; the state is written to `<root>/state/security-nag.json` |
| `keyFile` | `<root>/signing.key` | the shared key (32 bytes of hex) |
| `keysDir` | `<root>/keys` | the per-device key directory; **the key is looked up by the sender declared in the envelope**, and with no dedicated key it falls back to the shared key |

## Signature verification rules

* the signature domain is **exactly the same** as `dsh-whale-post-bus`'s `FIELD_ORDER` (`mode` is in there too);
* it borrows `whale.bus`'s `digest` / `sign` first —— to guarantee "the same algorithm as the core, not each computing its own";
* once enabled it is **fail-closed**: a missing field / **an unregistered field appearing** / a body that does not match its digest / a signature that does not match / not on the allow-list ⇒ all refused.
