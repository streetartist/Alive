import { boolean, number, object, optional } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

/**
 * Persisted desktop-control policy.
 * Fail-closed: control stays disabled until the user enables it.
 */
export const desktopControlConfigSchema = object({
  enabled: optional(boolean()),
  requireUserConfirmation: optional(boolean()),
  maxListedWindows: optional(number()),
})

export function createDesktopControlConfig() {
  const config = createConfig('desktop-control', 'policy.json', desktopControlConfigSchema, {
    default: {
      enabled: false,
      requireUserConfirmation: true,
      maxListedWindows: 12,
    },
  })
  config.setup()
  return config
}
