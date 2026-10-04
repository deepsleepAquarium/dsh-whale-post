# Contributing and submitting (CONTRIBUTING)

> 中文: [CONTRIBUTING.md](CONTRIBUTING.md)

## 1. General rules

* **Independent implementation**: this repository does not accept "code carried over from a repository that has no license". **Borrow ideas, not code.**
* **Replaceability is a hard requirement**: every plugin must be replaceable; the core must not know any member name, type identifier or machine path.
* **Offline by default**: any feature that "notifies someone" does not wake the other side by default.

## 2. Self-check before you submit

1. **Run the self-test**: `npx dsh-whale-post-cli selftest` —— **look only at the exit code**, not at the Chinese in the output.
2. **Negative test**: break any one line and the self-test must turn red; if it does not turn red, the criteria are not doing their job.
3. **Load-level verification**: do one real launch, and the log must contain no load errors.
4. **Zero credentials**: keys, credentials, passphrases and private paths **must not enter the repository at all** (including examples and comments).
5. **Anonymization**: personal names in examples are always `alice` / `bob`; quota numbers are always **example values**; do not write real machine names, internal network addresses or absolute paths.

## 3. How a single change gets merged

* **The author does not self-review**: whoever makes the change does not do the final review of it.
* **Two-person review**: one person makes the change, another person verifies it independently (by running it in their own temporary environment, not by reading the code).
* **The review looks at three things**: the footprint of the change (where the diff lands) / the behavioural criteria (did it really change as expected) / **whether anything that should not have been touched was touched** (envelope format, signature conventions, compatibility).

## 4. Leaving a trail

* Before every change, **leave a backup** (`.bak-<what-changed>-<timestamp>`).
* When you are done, write "what changed, why, and how it was verified" into the commit message —— future you (and your teammates) will have only that to reconstruct what happened.
* A backwards-incompatible change must be explained separately: what happens to old data, and what happens to old peers.

## 5. What is not welcome

* Any pattern that **hangs silently** (for example "start only after the service is injected", which never moves if the service never arrives).
* Tests that make **the self-test lie for the code** (assertions edited to follow the implementation).
* Turning the quota / the gate into a "**muzzle gate**": a gate should be a **price gate** —— block what should be blocked (illegal values), bill what should be billed (over quota), and **anything that takes no action must not silently downgrade**.
