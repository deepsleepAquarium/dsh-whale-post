# dsh-whale-post-roster

The roster interface: **who is on the list** (including the **member attributes** and the **broadcast list**) + a sample implementation that reads JSON

* Provides the interface: `whale.roster`
* Interfaces depended on: (none)
* Self-test: `node selftest.mjs` (**look only at the exit code**: 0 pass / non-zero fail)

The interfaces carry `apiVersion`; **the core is not allowed to know a single name** —— the roster **lives only here**, and the core does not have one name in it.
**The same goes for attribute names**: the `name` in `flag(id, name)` is given by **configuration or the caller** ⇒ **no concrete attribute name appears in this piece**.

## Interface

| Method | In one sentence |
|---|---|
| `list()` | all members (**keeping the other fields members carry** —— custom attributes do not get eaten) |
| `has(id)` | is this person on the list |
| `label(id)` | what they are called (falling back to `id`) |
| `member(id)` | **the whole member record** (custom attributes included); not recognised ⇒ `undefined` |
| `flag(id, name)` | a **member attribute**: both sources are accepted; a falsy value (`false` / `0` / 空串) always counts as "**does not carry it**" |
| `without(ids, name)` | **strip out** the people carrying that attribute from a list (someone not recognised **is kept as they are** —— we do not overstep and rewrite the list) |
| `broadcast()` | **who a broadcast should go to** = the full list with `groupWithout` stripped out |
| `groups()` | which group names exist |
| `group(name, opts)` | the members of a group; `opts.without` strips some out for now; `opts.without: null` ⇒ no stripping this time |

## The roster file (the format is public, the content is yours to write)

```json
{ "apiVersion": 1,
  "members": [ { "id": "alice", "label": "Alice" },
               { "id": "carol", "label": "Carol", "<属性名>": true } ],
  "groups": { "all": ["alice", "carol"], "club": ["alice"] },
  "<属性名>": ["carol"] }
```

* `id` is exactly the **mailbox directory name** (`<root>/inbox/<id>/`).
* **A member attribute is accepted in either of two forms** (pick one): ① written on the member object ② an array of the same name at the top level.
* A member written as a **plain string** is accepted too (`"alice"`); anything without an `id` is dropped.
* **Bad input throws no uncaught exception** —— bad JSON / not an object / an `apiVersion` we do not recognise ⇒ all of it degrades to an **empty roster**.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `file` | `<root>/roster.json` | the roster file |
| `groupWithout` | unset | **stripped out of a broadcast by default** for members carrying this attribute; **a named send is unaffected** ("a broadcast does not reach them by default; only naming them does") |
| `sample` | `false` | `true` ⇒ use the built-in sample when the file does not exist (**for trial runs only**) |

## Boundaries

* **The provider can lie and the core cannot stop it** —— the core knows no names, so it **cannot decide for itself "who even counts as a legitimate member"**;
  if you want to guard against that layer, add validation and self-tests in **this piece**.
* **A group member has to appear on the roster** before anything is delivered (otherwise a "ghost group member" receives letters ⇒ files get written into a mailbox that is not on the list).
* **A send to a group where everyone has been stripped out ⇒ refusal** (rather not send at all than send a letter with no recipient).
