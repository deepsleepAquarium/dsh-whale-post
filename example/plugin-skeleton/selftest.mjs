/**
 * Load-level self-test for the skeleton — the check `docs/INSTALL.md` §5 rule 14 asks for.
 *
 * It calls `apply()` with a context that records what was registered, and it deliberately watches
 * for the things a plugin must not do at apply time. No engine needed.
 *
 *   node example/plugin-skeleton/selftest.mjs
 *
 * The criterion is the exit code: 0 passes, non-zero fails.
 */
import { apply, createThing, name, apiVersion } from './index.js'

let failed = 0
const check = (label, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : '  :: ' + detail}`)
}

check('exports a name', typeof name === 'string' && name.length > 0)
check('exports an apiVersion', Number.isInteger(apiVersion))

/* The real test: apply() gets a context that records registrations, and any other property it
   reaches for — read or written — is recorded instead of quietly working. Both the getter and the
   setter record, so a plugin that assigns `ctx.whale` fails this check with a line rather than a
   stack trace. This is the failure the rules describe: in a real engine it arrives as
   `without inject`, and only when someone boots. */
const provided = {}
const touched = []
const ctx = { provide: (key, value) => { provided[key] = value } }
for (const forbidden of ['whale', 'get', 'on', 'plugin', 'inject', 'effect']) {
  Object.defineProperty(ctx, forbidden, {
    get() { touched.push('read ' + forbidden); return undefined },
    set() { touched.push('write ' + forbidden) },
    configurable: true,
  })
}

apply(ctx, { prefix: 'hi' })
check('apply() registers exactly one service', Object.keys(provided).length === 1, JSON.stringify(Object.keys(provided)))
check('apply() reads no other context property', touched.length === 0, touched.join(', '))

const thing = provided['whale.skeleton']
check('the registered service has the documented surface',
  !!thing && typeof thing.greet === 'function' && typeof thing.calls === 'function')
check('it behaves', thing.greet('whale') === 'hi whale (call 1)' && thing.calls() === 1)

/* And the factory works on its own, which is what makes the behaviour testable without an engine. */
const bare = createThing()
check('the factory works with no context and no config',
  bare.greet() === 'hello world (call 1)' && bare.calls() === 1)

console.log(`\n${failed === 0 ? 'all checks passed' : failed + ' check(s) failed'}`)
process.exit(failed ? 1 : 0)
