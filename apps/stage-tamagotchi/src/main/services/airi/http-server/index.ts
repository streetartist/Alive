import type { Lifecycle } from 'injeca'

import type { ServerManager } from './server-manager/types'

import { createHttpServerManager } from './server-manager'

export interface BuiltInServer {
  start: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Composes AIRI local HTTP servers behind one lifecycle service.
 *
 * Use when:
 * - Main process needs one start/stop entrypoint for local HTTP services
 *
 * Expects:
 * - Each server follows the `ServerManager` lifecycle contract
 *
 * Returns:
 * - A lifecycle service with ordered startup/shutdown behavior
 */
export function setupBuiltInServer(params: {
  authServer?: ServerManager
  staticAssetServer?: ServerManager
  servers?: ServerManager[]
  lifecycle?: Lifecycle
}): BuiltInServer {
  const servers = [
    ...(params.authServer ? [params.authServer] : []),
    ...(params.staticAssetServer ? [params.staticAssetServer] : []),
    ...(params.servers ?? []),
  ]
  const manager = createHttpServerManager(servers)

  params.lifecycle?.appHooks.onStart(() => manager.start())
  params.lifecycle?.appHooks.onStop(() => manager.stop())

  return {
    start: manager.start,
    stop: manager.stop,
  }
}
