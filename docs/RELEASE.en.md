# Release checklist (RELEASE)

> 中文: [RELEASE.md](RELEASE.md)
>
> ★★**What this file is** ✗: ★**"when you want to ship a new version, which steps do you do, in what order"** ✓ ——
> ★★work through it in order; ★**every step says why** ✗ (★otherwise the next person will skip it ✓).
> ⓘ ★**Publishing is irreversible** ✗: ★a version on npm cannot be withdrawn (★only `deprecate`d, never deleted ✓) ⇒ **slow beats wrong** ✓.

---

## ★ Step 0: run four things first; **all green before you ship** ✗

```bash
npm run selftest     # 10 items: load-level + static criteria + cross-package + doc parity + package metadata
npm run racetest     # 11 criteria: concurrent sequence claiming + concurrent accounting
npm run doccheck     # Chinese/English doc parity
npm run pkgcheck     # package metadata (★every publishing pit lives here)
★★Also: `selftest` compares the **criterion count** against `scripts/criteria-baseline.mjs` ✓ —— ★★**counts may only grow, never quietly shrink** ✗ (★delete one without updating the baseline ⇒ non-zero exit ✓).
npm run compat       # ★★cross-version: really runs the version published on npm (★needs network, ~40 s)
```

★★ **One more step you cannot skip** ✗: **boot it for real once** (★a green `npm run selftest` does **not** mean the engine can load ✓ ——
we hit exactly that: all six plugins **failed to load**, and **neither the self-tests nor `--dump-config` could see it** ✗).

## ★★ Step 1: **ship the six plugins first**, then `cli` ✗✓

```bash
# ★order matters: cli's dependencies pin the siblings at ^<this version> ⇒
#   ★★if you publish cli first it asks for a version that **does not exist yet** ⇒ installers fail on the spot
for p in bus roster types deliver gate verify; do
  npm publish --workspace "packages/$p" --registry https://registry.npmjs.org
done
npm publish --workspace packages/cli --registry https://registry.npmjs.org
```

★★ **Two pits** ✗:
* ★**you must pass `--registry https://registry.npmjs.org` explicitly** ✓ —— ★this repository's `.npmrc` defaults to a mirror, and ★
  **a mirror cannot publish** ✓ (★you will see 404 / 403, and **not** "no permission" ✓).
* ★`pkgcheck` item ②b watches "**dependency ranges cover the current version**" ✓ —— ★**it is the one criterion that will stop you before shipping** ✓.

## ★★ Step 2: wait for npm to sync, then **install it for real** ✗✓

```bash
# ★npm's registry takes a few minutes to sync ⇒ do not install the moment you publish
mkdir /tmp/verify && cd /tmp/verify
npm init -y
npm i dsh-whale-post-cli@<this version>
npx dsh-whale-post-cli selftest    # ★look only at the exit code: 0 = pass
```

★★**Why this is unavoidable** ✗✓: ★"the self-tests are green" does **not** mean "someone else can install it and run it" ✓ ——
★and ★**the difference between those two things lives precisely in the metadata** (★not in the code ✓).

## ★ Step 3: tag it and push the tag ✗

```bash
git tag -a v<this version> -m "v<this version>"
git push origin v<this version>
```

★**Why tag at all** ✗: ★the README says "**do not pin the old tag**" ✓ (★`0.1.x` has all six plugins failing to load in a real engine ✓) ——
★**so every usable version needs a tag you can pin** ✓.

## ★★ Step 4: update "what is the latest version on npm" in the docs ✗✓

★Before a release, the docs say "**the latest on npm is the previous version / this checkout is already this version (in preparation)**" ✓ ——
★★**after the release those two sentences are stale** ✗ ⇒ change them to "**the latest on npm is this version**" ✓.

★**Where to look** ✗: `README` / `docs/INSTALL` / `packages/cli/README` (★one Chinese and one English copy each ✓) plus
★the "(**in preparation**)" note in the `## v<this version>` heading of the `CHANGELOG` ✓.

## ★★ Step 5: run step 0 once more after those edits ✗✓

★★ **Because step 4 touches documentation** ✓ ⇒ ★`doccheck` and `pkgcheck` can both be affected ✓ (★especially: **change both languages together** ✓).

---

## ★★ A cheat sheet ✗

| # | What to do | What breaks if you forget |
|---|---|---|
| ★0 ✗ | ★four green + **boot it once** | ★**it installs but does not work** ✓ |
| ★★1 ✗✓ | ★**six first, `cli` last** | ★★**`cli` cannot be installed** (★the version it needs does not exist yet ✓) |
| ★★2 ✗ | ★**install it for real** | ★nobody ever verified "the copy that shipped" ✓ |
| ★3 ✗ | ★tag and push the tag | ★others have **no version they can pin** ✓ |
| ★★4 ✗ | ★update "what is latest on npm" | ★★**the docs lie** (★and that is the first impression of "works out of the box" ✓) |
| ★5 ✗ | ★run step 0 once more | ★the Chinese and English docs drift apart ✓ |

★ⓘ ★**Version policy** ✗: ★while this repository is on **`0.x`**, a minor bump (`0.1 → 0.2`) means **interfaces or behaviour may change** ✓;
★a patch bump means "**behaviour unchanged**" ✓ (★this is stated at the top of the `CHANGELOG` ✓).
