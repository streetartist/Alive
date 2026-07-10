# `@proj-airi/desktop-control`

Cross-platform desktop mouse/keyboard control for AIRI apps (Electron main).

## What it is

- **Public API** for normalized desktop actions (`move`, `click`, `drag`, `scroll`, `typeText`, `hotkey`, `focusWindow`, clipboard)
- **Fail-closed policy**: disabled by default, optional user confirmation, emergency kill-switch
- **Coordinate helpers** mapping vision frame points → global desktop pixels
- **Window snapshot** (active + top windows) and clipboard read/write
- **Runtime engine**: free community nut.js fork `@nut-tree-fork/nut-js` (prebuilt natives)
- **Vendored source**: open-source nut.js under `vendor/nut.js` for secondary development (Apache-2.0)

## When to use

- Electron **main process** needs to inject mouse/keyboard input on Windows, macOS, or Linux
- Agent tools / control APIs should depend on **this package only**, not nut.js directly

## When not to use

- Renderer process (no native desktop injection)
- Global shortcut **listening** only — use `uiohook-napi` / existing shortcut drivers instead

## Usage

```ts
import {
  createDesktopControl,
  mapFramePointToGlobal,
} from '@proj-airi/desktop-control'

const control = await createDesktopControl({
  policy: { enabled: true, requireUserConfirmation: true },
  confirmAction: async (_action, label) => {
    // host dialog — return true only after explicit user approval
    console.log('confirm', label)
    return true
  },
  onAudit: entry => console.log(entry),
})

await control.runAction({
  action: 'click',
  x: 400,
  y: 300,
  button: 'left',
  clickCount: 1,
})

await control.runAction({ action: 'focusWindow', titleIncludes: 'Notepad' })

const global = mapFramePointToGlobal({
  frameX: 100,
  frameY: 50,
  frameWidth: 1280,
  frameHeight: 720,
  sourceBounds: { x: 0, y: 0, width: 1920, height: 1080 },
})
```

## Build

```bash
pnpm -F @proj-airi/desktop-control build
```

Electron main loads the compiled `dist/*.mjs` entry (not raw TypeScript). Root `postinstall` / `build:packages` already builds this package.

## Secondary development

1. Edit sources under `vendor/nut.js` when forking nut behavior
2. Prefer keeping the public surface in `src/` stable for app consumers
3. Native modules must stay externalized in Electron builds (`@nut-tree-fork/*`)
4. After changing `src/`, run `pnpm -F @proj-airi/desktop-control build` (or restart `pnpm install` postinstall)

## License

- AIRI package code: MIT (repo)
- Vendored nut.js: Apache-2.0 (see `NOTICE` / upstream)
