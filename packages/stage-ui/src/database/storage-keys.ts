import type { Storage, StorageValue } from 'unstorage'

function normalizedStorageKey(key: string) {
  return key.replaceAll('/', ':')
}

/**
 * Lists logical keys beneath a mounted unstorage prefix.
 *
 * NOTICE:
 * The unstorage IndexedDB driver prepends its `base` to stored keys, but
 * `getKeys(base)` ignores that base before mounted-storage filtering. Exact
 * reads work while prefix enumeration returns no keys.
 * Source: `node_modules/unstorage/drivers/indexedb.mjs` and
 * `node_modules/unstorage/dist/index.mjs` (`getKeys`).
 * Removal condition: unstorage returns mount-relative keys from this driver,
 * or the workspace migrates away from driver-level `base` prefixes.
 */
export async function getStorageKeysUnderPrefix(
  storage: Storage<StorageValue>,
  prefix: string,
) {
  const directKeys = await storage.getKeys(prefix)
  if (directKeys.length > 0)
    return directKeys

  const logicalSuffix = normalizedStorageKey(prefix.slice(prefix.indexOf(':') + 1))
  const reconstructed = (await storage.getKeys()).flatMap((key) => {
    const normalized = normalizedStorageKey(key)
    const suffixIndex = normalized.indexOf(logicalSuffix)
    if (suffixIndex < 0)
      return []

    const remainder = normalized.slice(suffixIndex + logicalSuffix.length)
    return [`${prefix}${remainder.replaceAll(':', '/')}`]
  })
  return Array.from(new Set(reconstructed))
}
