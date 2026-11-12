/**
 * Resolve pi-ai's OpenAI-completions API across host versions.
 *
 * The host owns `@earendil-works/pi-ai`, not this plugin: a DSH/薪灵 build may
 * ship 1.3.x (where the factory lives at `api/openai-completions.lazy`), an
 * older build whose exports map only names `api/openai-completions`, or a
 * narrower build that only exposes the package root. Pinning one subpath makes
 * the whole plugin fail to import on the other hosts, so resolve is attempted
 * from most specific to least specific, including a direct dist-file import
 * that bypasses an exports map.
 *
 * @module dsh-model-dock/pi-ai-compat
 */

/** Subpaths to try, most specific first. */
const CANDIDATES = [
  '@earendil-works/pi-ai/api/openai-completions.lazy',
  '@earendil-works/pi-ai/api/openai-completions',
  '@earendil-works/pi-ai/api',
  '@earendil-works/pi-ai',
]

/** A module that already exports the factory (newer pi-ai). */
function directFactory(module) {
  for (const name of ['openAICompletionsApi', 'openaiCompletionsApi']) {
    if (typeof module?.[name] === 'function') return module[name]
  }
  return undefined
}

/**
 * Wrap a plain `stream`/`streamSimple` module in the factory shape
 * `createProvider({ api })` expects (older pi-ai, or a dist file imported
 * directly).
 */
function wrappedFactory(module) {
  if (typeof module?.stream !== 'function') return undefined
  return () => {
    const api = { stream: module.stream, streamSimple: module.streamSimple }
    if (typeof module.fetchDeferred === 'function') api.fetchDeferred = module.fetchDeferred
    if (typeof module.cancelDeferred === 'function') api.cancelDeferred = module.cancelDeferred
    return api
  }
}

/**
 * Resolve one factory. `skipLazy` is a test seam used to exercise the older
 * host shape on a machine that actually has 1.3.x installed.
 */
export async function resolveOpenAICompletionsApi(options = {}) {
  const specs = options.skipLazy === true ? CANDIDATES.slice(1) : CANDIDATES
  const failures = []
  for (const spec of specs) {
    try {
      const module = await import(spec)
      const factory = directFactory(module) ?? wrappedFactory(module)
      if (factory !== undefined) return factory
      failures.push(`${spec}: 未导出 openAICompletionsApi / stream`)
    } catch (error) {
      failures.push(`${spec}: ${error?.code ?? error?.message ?? String(error)}`)
    }
  }

  // Last resort: import the dist file next to the resolved package entry. This
  // ignores `exports`, which is exactly the restriction that broke the old host.
  try {
    const entry = import.meta.resolve('@earendil-works/pi-ai')
    for (const relative of ['api/openai-completions.lazy.js', 'api/openai-completions.js']) {
      try {
        const module = await import(new URL(relative, entry).href)
        const factory = directFactory(module) ?? wrappedFactory(module)
        if (factory !== undefined) return factory
        failures.push(`${relative}: 未导出 openAICompletionsApi / stream`)
      } catch (error) {
        failures.push(`${relative}: ${error?.code ?? error?.message ?? String(error)}`)
      }
    }
  } catch (error) {
    failures.push(`resolve root: ${error?.message ?? String(error)}`)
  }

  throw new Error(
    'dsh-model-dock: 无法从宿主的 @earendil-works/pi-ai 载入 OpenAI-completions API。'
    + ' 请升级 DSH/薪灵到自带 pi-ai >= 1.3 的版本，或把下面的诊断发给开发者：'
    + failures.join(' | '),
  )
}

/**
 * The factory this plugin's adapters use.
 *
 * `DSH_MODEL_DOCK_PI_AI_NO_LAZY=1` is an operator escape hatch: it skips the
 * lazy subpath and exercises the older fallback on a new host.
 */
export const openAICompletionsApi = await resolveOpenAICompletionsApi(
  process.env.DSH_MODEL_DOCK_PI_AI_NO_LAZY === '1' ? { skipLazy: true } : {},
)
