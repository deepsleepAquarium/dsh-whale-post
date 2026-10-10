# Composition example (example)

This document answers exactly one question: **how the seven parts wire together**.
(Parts without wiring ⇒ nobody who receives them can get them installed. This document is that
wiring.)

## 1. Minimal wiring (`cordis.patch.yml`)

```yaml
- insert:
    - id: whale-roster-json
      name: dsh-whale-post-roster
      config:
        file: '~/.dsh/whale-mail/roster.json'   # you fill in the roster contents (format below)

    - id: whale-types-sample
      name: dsh-whale-post-types
      config:
        types: [direct, broadcast, club]         # three samples ship with the package; register your own types yourself

    - id: whale-bus
      name: dsh-whale-post-bus
      config:
        root: '~/.dsh/whale-mail'
        requireHello: true                       # the protocol does not allow sending directly "the way UDP does"

    - id: whale-deliver
      name: dsh-whale-post-deliver               # example 1: offline post office (offline = hold it, online = deliver it)

    - id: whale-gate
      name: dsh-whale-post-gate                  # example 2: quota and billing gate + loopback gate
      config:
        quota:
          onOver: reject                         # reject refuses to send + non-zero exit code / price still sends but bills
          types:
            direct:    { label: 'direct',    limit: 120 }
            broadcast: { label: 'broadcast', limit: 45 }
            club:      { label: 'club',      limit: 60 }
            offline:   { label: 'offline',      limit: 80, perSend: true }   # offline parts are counted per send

    - id: whale-verify
      name: dsh-whale-post-verify                # safety verification: **disabled by default** (if enabled is not written, it is off)
      config:
        enabled: false                           # write true to turn it on; while disabled it reminds you to enable it (stops reminding after three days in a row)
```

**Order does not matter**: the six plugins depend only on the interface (`ctx.whale.*`) — the core
knows no names and no type identifiers.

## 2. Roster file (`roster.json`)

```json
{ "apiVersion": 1,
  "members": [ { "id": "alice", "label": "Alice" },
               { "id": "bob",   "label": "Bob" } ],
  "groups": { "all": ["alice", "bob"] } }
```

`id` is the mailbox directory name (`<root>/inbox/<id>/`). **The roster lives only in this file**;
there is not a single name in the code.

## 3. Run it once (criterion: exit code)

```bash
# start a throwaway post office with the CLI (does not touch your real data)
# put the roster in first (no roster = nobody knows anybody ⇒ you get "unknown recipient")
mkdir -p ./tmp-mail && cp example/roster.json ./tmp-mail/roster.json

node packages/cli/index.js hello --as alice --root ./tmp-mail
node packages/cli/index.js hello --as bob   --root ./tmp-mail
node packages/cli/index.js send  --as alice --to bob --subject 第一封 --body '离线件：等你来收' --root ./tmp-mail
node packages/cli/index.js pump  --as bob --root ./tmp-mail      # ⇒ 1 pulled (offline part)
node packages/cli/index.js quota --as alice --root ./tmp-mail    # ⇒ 1 offline item
echo $?    # 0 = pass
```

**Offline parts are never lost**: after `send` the letter sits in `inbox/bob/`; `bob` can come
collect it whenever (no live session ⇒ **it is neither delivered nor consumed** ⇒ the letter can
only arrive late, never fail to arrive).

**To see online delivery**: mark the recipient as "has a live session right now" —

```bash
node packages/cli/index.js send --as alice --to bob --mode online --live bob \
  --subject '要你动手' --body '在线件：立刻投进你的会话' --root ./tmp-mail
```

## 5. Want to write a new plugin? Copy `plugin-skeleton/`

**`example/plugin-skeleton/`** is a **minimal installable and runnable** plugin, four files:
`package.json` (how to declare `dsh.bundle`), `cordis.patch.yml` (how to install it),
`index.js` (what `apply()` should look like), `selftest.mjs` (how to write a load-level selftest).

```bash
node example/plugin-skeleton/selftest.mjs      # => 7/7 (it has already verified itself)
```

**The one thing you trip over most when changing it**: **inside `apply()` you may only
`ctx.provide`** — **do not read and do not write `ctx.whale`** (in the real engine it throws
`without inject`, **and `--dump-config` cannot show it**).
## 4. Per-part selftest

```bash
node scripts/selftest-all.mjs        # all seven in one run (exit code 0 = all pass)
node packages/bus/selftest.mjs       # run one part (to see the details)
```

Every criterion guards a real incident (see [`../docs/ACCEPTANCE.md`](../docs/ACCEPTANCE.md)).
