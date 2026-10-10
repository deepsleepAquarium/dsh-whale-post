# Release checklist (RELEASE)

> 中文: [RELEASE.md](RELEASE.md)
>
> **What this file is**: **"when you want to ship a new version, which steps do you do, in what order"** ——
> work through it in order; **every step says why** (otherwise the next person will skip it).
> ⓘ **Publishing is irreversible**: a version on npm cannot be withdrawn (only `deprecate`d, never deleted) ⇒ **slow beats wrong**.

---

## Before step 0: **decide the version number first** (the step most easily skipped —— and skipping it ships the wrong number)

**Ask one question**: **did the interface or the behaviour change this time?**

| What changed | Which number goes up | How it moves |
|---|---|---|
| The **interface** (a new method / exit) **or the behaviour** (same input, different result) | the **middle** number | **middle number plus one, last number back to zero** |
| **Documentation only, or a fix that changes no behaviour** | the **last** number | **last number plus one** |

**Why this deserves its own step** (from an actual run on 2026-10-11):

> That time `gate` gained the public interface `recount` and `cli` gained the `reconcile` command ——
> **both the interface and the behaviour changed**, and only the last number moved. The rule was
> **already written down in two places** (`CONTRIBUTING` section 1 and the "version policy" note at the end
> of this file). **The harm was real**: anyone whose dependency range used the caret silently picked up a
> behaviour change —— and keeping "may change" apart from "will not change" is exactly what the middle
> number is for. So a rule parked in a cheat sheet does not work: **put it where the decision is made**.

**And read the "documentation only" line carefully**: it means **documentation only**; if any code moved at
all (even adding one exit), follow the row above.

---

## Step 0: run four things first; **all green before you ship**

```bash
Also: **the pre-commit gate has to be installed first** : `npm run hooks:install`  (local configuration, **a fresh clone will not have it automatically** ) —— once installed, every `git commit` runs `selftest` automatically and a non-zero exit refuses the commit .
npm run selftest     # 11 items: load-level + static criteria + cross-package + doc parity + package metadata + import hygiene
npm run racetest     # 11 criteria: concurrent sequence claiming + concurrent accounting
npm run doccheck     # Chinese/English doc parity
npm run pkgcheck     # package metadata (every publishing pit lives here)
Also: `selftest` compares the **criterion count** against `scripts/criteria-baseline.mjs`  —— **counts may only grow, never quietly shrink**  (delete one without updating the baseline ⇒ non-zero exit ).
npm run compat       # cross-version: really runs the version published on npm (needs network, ~40 s)
```

**One more step you cannot skip**: **boot it for real once** (a green `npm run selftest` does **not** mean the engine can load ——
we hit exactly that: all six plugins **failed to load**, and **neither the self-tests nor `--dump-config` could see it**).

## Step 1: **ship the six plugins first**, then `cli`

```bash
# order matters: cli's dependencies pin the siblings at ^<this version> ⇒
#   if you publish cli first it asks for a version that **does not exist yet** ⇒ installers fail on the spot
for p in bus roster types deliver gate verify; do
  npm publish --workspace "packages/$p" --registry https://registry.npmjs.org
done
npm publish --workspace packages/cli --registry https://registry.npmjs.org
```

**Two pits**:
* **you must pass `--registry https://registry.npmjs.org` explicitly** —— this repository's `.npmrc` defaults to a mirror, and
  **a mirror cannot publish** (you will see 404 / 403, and **not** "no permission").
* `pkgcheck` item ②b watches "**dependency ranges cover the current version**" —— **it is the one criterion that will stop you before shipping**.

## Step 2: wait for npm to sync, then **install it for real**

```bash
# npm's registry takes a few minutes to sync ⇒ do not install the moment you publish
mkdir /tmp/verify && cd /tmp/verify
npm init -y
npm i dsh-whale-post-cli@<this version>
npx dsh-whale-post-cli selftest    # look only at the exit code: 0 = pass
```

**Why this is unavoidable**: "the self-tests are green" does **not** mean "someone else can install it and run it" ——
and **the difference between those two things lives precisely in the metadata** (not in the code).

## Step 3: tag it and push the tag

```bash
git tag -a v<this version> -m "v<this version>"
git push origin v<this version>
```

**Why tag at all**: the README says "**do not pin the old tag**" (`0.1.x` has all six plugins failing to load in a real engine) ——
**so every usable version needs a tag you can pin**.

## Step 4: update "what is the latest version on npm" in the docs

Before a release, the docs say "**the latest on npm is the previous version / this checkout is already this version (in preparation)**" ——
**after the release those two sentences are stale** ⇒ change them to "**the latest on npm is this version**".

**Where to look**: `README` / `docs/INSTALL` / `packages/cli/README` (one Chinese and one English copy each) plus
the "(**in preparation**)" note in the `## v<this version>` heading of the `CHANGELOG`.

## Step 5: run step 0 once more after those edits

**Because step 4 touches documentation** ⇒ `doccheck` and `pkgcheck` can both be affected (especially: **change both languages together**).

## Step 6: after publishing, run the **two published versions against each other**

```bash
# "checkout vs old" and "**two published versions**" **are not the same thing**  —— npx paths, dependency resolution and packaged files can all differ
npx -y dsh-whale-post-cli@<new> send --as a --to b --body ... --root <temp root>
npx -y dsh-whale-post-cli@<old> pump --as b --root <temp root>   # this direction should **bounce** (new fields cannot enter the old signature domain )
npx -y dsh-whale-post-cli@<old> send --as b --to a --body ... --root <temp root>
npx -y dsh-whale-post-cli@<new> pump --as a --root <temp root>   # this direction should **work**
```

**Why do it separately**: `npm run compat` runs **checkout vs the previous published version**;
whereas "two published versions" adds one more layer of reality: the copy `npx` installs **is what other people actually get**.

Measured (**at the 2026-10-10 release** —— see the `CHANGELOG` for exactly which version):
| Direction | Result |
|---|---|
| `<old>` sends ⇒ `<new>` receives | **works** |
| `<new>` sends ⇒ `<old>` receives | **bounces** |

**Why the two directions differ**: **the new version added fields to the signature domain** ⇒ **the old version's fail-closed rule does not recognise them**
(and "new fields cannot enter the old signature domain" **cannot be fixed** —— the old code is already published).
␈ **Which versions exactly, and the bounce text** ⇒ see the `CHANGELOG` "Read first (2): mixed versions are not compatible"
(**that is where history is recorded**; this checklist keeps only "what to do" —— **which is also what `pkgcheck` item ⑪ wants**:
**a checklist must not hard-code a version**, otherwise every release needs an edit here and a missed edit ships the wrong version).

The conclusion **goes into the `CHANGELOG` "Read first (2)"** ("upgrade both sides first, then start sending").
---

## A cheat sheet

| # | What to do | What breaks if you forget |
|---|---|---|
| 0 | four green + **boot it once** | **it installs but does not work** |
| 1 | **six first, `cli` last** | **`cli` cannot be installed** (the version it needs does not exist yet) |
| 2 | **install it for real** | nobody ever verified "the copy that shipped" |
| 3 | tag and push the tag | others have **no version they can pin** |
| 4 | update "what is latest on npm" | **the docs lie** (and that is the first impression of "works out of the box") |
| 5 | run step 0 once more | the Chinese and English docs drift apart |

ⓘ **Version policy**: while this repository is on **`0.x`**, a minor bump (`0.1 → 0.2`) means **interfaces or behaviour may change**;
a patch bump means "**behaviour unchanged**" (this is stated at the top of the `CHANGELOG`).
