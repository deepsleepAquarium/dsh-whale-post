/**
 * A minimal DSH plugin skeleton.
 *
 * Copy this directory, rename the plugin, and you have something that installs and loads.
 * `docs/INSTALL.md` §5 has the fourteen rules with the failure behind each one; these are the
 * four that break a plugin tree at load time:
 *
 *   1. `apply(ctx, config)` does exactly one thing — it registers a service:
 *      `ctx.provide('whale.xxx', value)`. Nothing else belongs there.
 *   2. Never read or write the `ctx.whale` property. In a real Cordis engine that needs `inject`
 *      first and throws `cannot get property "whale" without inject`, after which the whole
 *      plugin tree fails to load. `--dump-config` will not show it: it builds the config tree
 *      and never runs `apply()`.
 *   3. If you need another service, read it at call time with `ctx.get('whale.xxx')`, not while
 *      applying.
 *   4. Keep a load-level self-test beside it (`./selftest.mjs`). A plugin that parses is not a
 *      plugin that loads — that difference cost us an evening once.
 */

/** The service name this plugin registers. */
const SERVICE = 'whale.skeleton'

export const name = 'plugin-skeleton'

/** Bump this when the surface below changes shape. */
export const apiVersion = 1

/**
 * The behaviour, in a plain factory so it can be tested without an engine.
 */
export function createThing(config = {}) {
  const state = { calls: 0 }
  const prefix = typeof config.prefix === 'string' ? config.prefix : 'hello'
  return {
    apiVersion,
    greet(who = 'world') {
      state.calls += 1
      return `${prefix} ${who} (call ${state.calls})`
    },
    calls() {
      return state.calls
    },
  }
}

/**
 * The only wiring point the engine calls.
 *
 * Registering the service is all this may do. Fetching, scheduling, or reaching for another
 * plugin here is what turns "it loads in my test" into "the tree failed to load".
 */
export function apply(ctx, config) {
  ctx.provide(SERVICE, createThing(config))
}
