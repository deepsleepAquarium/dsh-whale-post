# dsh-whale-post-types

> 中文: [types README（中文）](https://github.com/deepsleepAquarium/dsh-whale-post/blob/main/packages/types/README.md)

**Mail type registry** interface + sample types (`direct`／`broadcast`／`club`)

* Provides interface: `whale.types`
* Depends on interfaces: (none)
* Self-test: `node selftest.mjs` (**look at the exit code only**: 0 pass／non-0 fail)

The interface carries an `apiVersion`; **the core must not know any type identifier** —— that is why types **are registered in**.

## Interface

| Method | In one line |
|---|---|
| `register(id, meta)` | Register a type: `{ label, urgent, billable, priority, … }` (`meta` has defaults when omitted) |
| `resolve(id)` | Check whether this type is registered |
| `list()` | List all types |
| `meta(id)` | Same as above, returns `null` if not found |

## The line it holds (why this piece has to exist)

**The core does not recognize any type identifier** —— so the package ships **only three sample types**:
`direct` (one-to-one)／`broadcast` (mass send, possibly many readers)／`club` (inside a small group).

**To add a new type** ⇒ `types.register('your own', { … })` —— **not one line of the core has to change**.

**Unregistered types are rejected on the spot** (**never silently treated as the default type** —— we have been burned by the accident "**get the urgent type wrong and you never wake anyone up**").

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `types` | three samples | Type table; **both array and object forms are accepted** (`['direct','club']` or `{ direct: {…} }`; `[id, meta]` entries inside the array are accepted too) |
| `extra` | not set | **Append** registrations beyond the samples (`[[id, meta], …]`) |

## Boundaries

* **A lying provider cannot be stopped** —— the core does not recognize type identifiers, so it **cannot decide by itself "what counts as a legal type"**;
  if you want to guard that layer, add validation and a self-test in **this piece**.
* **Type identifiers must stay outside real code** —— in this piece they are **allowed only in documentation and sample blocks** (a criterion watches this).
