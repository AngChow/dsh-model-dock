/**
 * The provider ids this plugin owns, in one place.
 *
 * DSH provider ids are global to the host process: two plugins that pick the
 * same id do not merge, the second registration simply fails (or, worse, the
 * first plugin's empty lane answers every call). 自由模型坞 also ships a Qoder
 * channel, which is exactly the collision this prefix prevents — every id this
 * plugin registers now starts with `safe_`.
 *
 * The prefix is part of the public contract: a saved model selection, a
 * transcript's provider stamp, and a `modelIdentity` all spell these strings.
 * Change one here and change the client literals in `client.js` with it.
 *
 * @module dsh-model-dock/ids
 */

/** Prefix every provider id this plugin registers. */
export const SAFE_PREFIX = 'safe_'

/** Provider ids, one per lane. */
export const PROVIDER_IDS = {
  /** WorkBuddy CN. */
  workbuddy: `${SAFE_PREFIX}workbuddy`,
  /** WorkBuddy AI (international). */
  workbuddyGlobal: `${SAFE_PREFIX}workbuddy-global`,
  /** Qoder international. */
  qoder: `${SAFE_PREFIX}qoder`,
  /** Qoder CN. */
  qoderCn: `${SAFE_PREFIX}qoder-cn`,
  /** 千问办公. */
  qwenwork: `${SAFE_PREFIX}qwenwork`,
}

/**
 * Model identities (the provider stamp a model row carries).
 *
 * WorkBuddy's two regions deliberately share one identity so a transcript
 * keeps its thinking blocks when the user switches region; each region still
 * registers its own route id.
 */
export const MODEL_IDENTITIES = {
  workbuddy: `${SAFE_PREFIX}workbuddy`,
  qoder: `${SAFE_PREFIX}qoder`,
  qwenwork: `${SAFE_PREFIX}qwenwork`,
}

/** Whether a provider id belongs to this plugin. */
export function isOwnProviderId(id) {
  return typeof id === 'string' && Object.values(PROVIDER_IDS).includes(id)
}
