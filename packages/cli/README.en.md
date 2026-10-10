# dsh-whale-post-cli

> 中文: [cli README（中文）](https://github.com/deepsleepAquarium/dsh-whale-post/blob/main/packages/cli/README.md)

Zero-dependency command line (**it is an entry tool, not a plugin**)

* Provides: (none: it is a command line, not a plugin)
* Depends on: `whale.bus`, `whale.roster`, `whale.types`, `whale.gate`, `whale.deliver`, `whale.verify`
  (**you wire them together yourself** —— in the source this move is called `wire()`)
* Self-test: `node selftest.mjs` (**look only at the exit code**: 0 pass / non-zero fail)

## Commands

| Command | What it does |
|---|---|
| `hello --as <who>` | Handshake (the protocol does not allow sending directly "the way UDP does" ⇒ without a handshake you may not send a letter) |
| `send --as <who> --to <who\|group> --subject <subject> --body <body>` | Send one letter; optional `--mode online\|offline` / `--type <type>` / `--re <parent letter id>` / `--force` / `--live a,b` |
| `pump --as <who> [--keep]` | Collect letters (**with no reader present it does not consume a single one**) |
| `pickup --as <who> --remote <another mailbox root>` | **Go to another mailbox root and fetch your own letters back** (**it works offline too** —— in "three offline, one online" this is the step after the doorbell has rung): every letter is **signature-verified first** (one that fails is **not moved**) ⇒ written locally ⇒ **the remote copy is deleted only after the local write succeeded** (otherwise that is a lost letter) ⇒ anything already in `seen` / already present is **skipped** (idempotent) |
| `quota --as <who> [--days N]` | Check the quota (offline letters are counted "per item", not by unit) |
| `reconcile --as <who> [--days N] [--remote <root>]` | **Reconcile**: recompute a ledger from the filesystem and compare it **per day, per bucket** with the recorded one —— **match ⇒ exit 0; difference ⇒ exit 3**. ⚠️ `forced` / `over` / `feeCent` / `byPhone` / `recent` **cannot be recomputed** (the files do not carry those facts); the command prints a "not compared" line saying so. **Letters sent to the remote side are not on this machine** ⇒ by default only the local root is counted; pass `--remote` to include it |
| `verify [--enable\|--disable] [--allow a,b]` | **See the safety-verification status / turn it on or off** (disabled by default; while it is disabled it reminds you to turn it on) |
| `nag` | **See whether a reminder is due** (at most once a day while it is not enabled; after three days in a row it stops reminding) |
| `roster` / `types` / `key` | See the roster / see the types / see the key fingerprint (**the key itself is not printed**) |
| `selftest` | End-to-end self-test (a temporary directory, **it does not touch real data**) |

## Common arguments and exit codes

* `--root <dir>`: the mailbox root (default `./.whale-mail`, or the environment variable `WHALE_POST_ROOT`)
* `--roster <roster json>`: the roster file
* `--live a,b`: **declares "these people have a live session right now"** (only online letters are really delivered)
* `--remote <dir>`: `pickup`'s **remote mailbox root** (the environment variable `WHALE_POST_REMOTE_ROOT` also works)
* **`send --remote <mailbox root> --remote-only <attribute>`: deliver the letter to a remote mailbox** (the **deliver** half of S6):
  members carrying `<attribute>` (a phone, say) ⇒ **write the remote `inbox/<member>/` and keep no second copy locally**.
  **Why no copy may stay locally**: keeping one creates **two authorities** (and the two will **disagree** about "pickup / receipts / consumption").
  Without `--remote-only` ⇒ **it writes locally as before** (old behaviour unchanged).
* **`pickup` mirrors the postbox's receipts back** (S6b): it used to **mirror only `hello/`** ⇒ **the sender's own machine could never see "the other side has received it"**.
  Two rules: **mirror only, never delete** (the postbox copy stays exactly as it is) / **idempotent** (identical content is skipped ⇒ **mtime does not move**).
* **`pickup` probes before it touches the "postbox"** (S12: do not hang when the link drops): it only checks whether **TCP 445** is reachable → a local path is **not probed**;
  if it cannot be reached it is **judged dead on the spot** ("**not a single file was touched**"). Why this is mandatory: **when SMB drops, the synchronous fs hangs for tens of seconds**,
  and **Node's synchronous fs has no timeout of its own** ⇒ the ceiling can only come from "a child process + timeout".
  Measured: an unreachable UNC ⇒ **judged dead in 2.8 s**; short-circuit the probe and run it again ⇒ it takes **22.7 s** to fail (that is the cost it holds off).
* **`--only-offline <attribute>`**: members carrying this attribute **receive offline letters only** (sending one an online letter ⇒ refused)
* `--dormant <attribute>`: members carrying this attribute are **explicitly marked dormant** (sending ⇒ **refused on the spot, the letter never enters their mailbox**; a partial dormancy **prints "who it was not delivered to"**)
* `--allow a,b`: the whitelist for safety verification

| Exit code | Meaning |
|---|---|
| `0` | success |
| `2` | **refused / invalid input** (quota / loop gate / unregistered type / unknown recipient / empty body / a misspelled `mode` …) |
| `1` | an error we did not expect |

**Read the exit code, not the Chinese in the output**.

## The two lines it defends

* **`--body` may not impersonate an argument** —— `--body --force` is read as "the body is `--force`, and `force` is set" ⇒ **and that bypasses all three gates in one move**;
  any option value starting with `--` counts as a mistake (exit code 2).
* **Argument order does not matter** —— `--as` / `--to` may be written before or after the command.
* **The latest on npm is now `0.5.4`** (that is what the `npx` line below installs); while **this checkout is `0.5.4` too** —— **the two now agree**.
* **Use the copy on npm**: `npx -y dsh-whale-post-cli@0.5.4 <command>` (no clone, no `npm install`).
