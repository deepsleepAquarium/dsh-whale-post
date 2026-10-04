# Acceptance specification (ACCEPTANCE)

> 中文: [ACCEPTANCE.md](ACCEPTANCE.md)

> This document is about one thing only: **how to prove that a plugin "really runs"**.
> It was bought with a real incident —— that one looked like this: **every syntax check passed, every module-level self-test passed, and yet one undefined constant made all 7 entry points crash on the same line and kept the service down for over ten hours.**

## 1. Five criteria shared by the five plugins

| Criterion | How | What failing looks like |
|---|---|---|
| **A. Load level** | Really load it with `import()` + call `apply()` with a stub context | Syntax passes, unit tests pass, and it throws `ReferenceError` the moment it is loaded |
| **B. Zero side effects** | Run with a temporary root; the real post office's `mtime` does not move at all; no real letters are sent | The self-test finishes and real data has been modified |
| **C. Machine-judgeable** | **Look only at the exit code** (0 pass / non-zero fail) | Deciding success by "whether some sentence appears in the text" |
| **D. No credentials** | Scan every file: keys, credentials, passphrases **0 hits** | A key "that is only used locally" gets committed |
| **E. Interfaces are replaceable** | Swap in a fake provider ⇒ the core behaviour does not change; grep the core files for **any member name / real type identifier / internal network path** ⇒ **0 hits** | The core recognises names, so it falls apart the moment you swap the roster |

> **E is the hard proof that "nothing can leak"**: the core knows no names and no types, so there is nowhere for a leak to come from.

## 2. Criteria per piece

| Piece | Must have at least these |
|---|---|
| `bus` | Signature verification round-trip; changing a single byte must fail it (**the delivery mode `mode` goes into the signature too**); idempotency (the same letter is consumed only once); atomic persist to disk; the handshake gate |
| `roster` | Eats the provider's data only; member names 0 hits; a group roster excludes the sender; bad input does not throw an uncaught exception |
| `types` | Register / resolve; an unregistered type is **refused on the spot** and the semantics are written into the documentation; **adding a new type in a test requires touching zero lines of the core**; real type identifiers 0 hits |
| `deliver` | An offline letter really stays in the mailbox (not consumed); an online letter goes out in the current round and **only once**; **the recipient has no live session ⇒ the letter stays in `inbox`** |
| `gate` | Over quota refuses to send + a non-zero exit code + nothing persisted to disk; a group send counts units by the number of recipients; the loop gate blocks by "M letters in N minutes / chain depth / pure receipt"; an empty body is refused |
| `cli` | Zero dependencies; argument order does not matter; a wrong value refuses to send; the help text contains no internal information |

## 3. Three hard rules

1. **Do not read the Chinese; look only at the exit code.**
2. **It can be re-run in place**: run it twice in a row, and the result is identical.
3. **Negative test**: **deliberately break one line ⇒ the self-test must turn red.**
   A self-test that does not turn red is decoration —— it only proves "the code did not crash", not "it is really checking something".

## 4. Done criteria

> **A load-level self-test + one real launch, with no load errors in the log.**

**Comparing hashes alone, or running module-level self-tests alone, does not count.**
A hash only proves "the file did not change", and a module self-test only proves "this module did not crash by itself" —— neither proves **that it can survive once it is hooked into the engine**.

## 5. How to run it

```bash
npx dsh-whale-post-cli selftest   # exit code 0 = pass; non-zero = fail
```

The self-test builds a fake post office in a **temporary directory** and **never touches real data**.
