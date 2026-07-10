import { Key } from '@nut-tree-fork/nut-js'

/**
 * Maps a normalized hotkey token (from {@link normalizeHotkeyPart}) to nut.js Key.
 */
export function mapHotkeyPartToNutKey(part: string): Key {
  const normalized = part.trim().toLowerCase()

  if (normalized.length === 1) {
    const ch = normalized[0]!
    if (ch >= 'a' && ch <= 'z')
      return Key[ch.toUpperCase() as keyof typeof Key] as Key
    if (ch >= '0' && ch <= '9')
      return Key[`Num${ch}` as keyof typeof Key] as Key
  }

  if (normalized.startsWith('f') && normalized.length > 1) {
    const n = Number(normalized.slice(1))
    if (Number.isInteger(n) && n >= 1 && n <= 24)
      return Key[`F${n}` as keyof typeof Key] as Key
  }

  switch (normalized) {
    case 'ctrl':
    case 'control':
      return Key.LeftControl
    case 'shift':
      return Key.LeftShift
    case 'alt':
      return Key.LeftAlt
    case 'win':
    case 'meta':
    case 'cmd':
    case 'command':
      return Key.LeftSuper
    case 'enter':
      return Key.Enter
    case 'return':
      return Key.Return
    case 'tab':
      return Key.Tab
    case 'escape':
    case 'esc':
      return Key.Escape
    case 'space':
      return Key.Space
    case 'backspace':
      return Key.Backspace
    case 'delete':
      return Key.Delete
    case 'left':
      return Key.Left
    case 'right':
      return Key.Right
    case 'up':
      return Key.Up
    case 'down':
      return Key.Down
    case 'home':
      return Key.Home
    case 'end':
      return Key.End
    case 'pageup':
      return Key.PageUp
    case 'pagedown':
      return Key.PageDown
    default:
      throw new TypeError(`No nut.js Key mapping for hotkey part "${part}"`)
  }
}
