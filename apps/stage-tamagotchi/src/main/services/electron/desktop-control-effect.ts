import type { DesktopControlAction, DesktopControlResult } from '@proj-airi/desktop-control'

import { BrowserWindow } from 'electron'

import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'

type DesktopControlEffectKind = 'move' | 'click' | 'drag' | 'scroll'

const effectWindowSize = 112

let effectWindow: BrowserWindow | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined

function effectKind(action: DesktopControlAction): DesktopControlEffectKind | undefined {
  switch (action.action) {
    case 'move':
    case 'click':
    case 'drag':
    case 'scroll':
      return action.action
    default:
      return undefined
  }
}

function createEffectWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: effectWindowSize,
    height: effectWindowSize,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setIgnoreMouseEvents(true)
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
          body { display: grid; place-items: center; }
          #effect { position: relative; width: 28px; height: 28px; border-radius: 999px; opacity: 0; }
          #effect::before, #effect::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
          #effect::before { background: radial-gradient(circle, rgba(255,255,255,.98) 0 14%, rgba(96,190,255,.96) 22%, rgba(0,122,255,.74) 48%, rgba(0,122,255,0) 72%); box-shadow: 0 0 16px 6px rgba(0,122,255,.56), 0 0 36px 14px rgba(30,144,255,.24); }
          #effect::after { inset: -8px; border: 2px solid rgba(81,181,255,.9); }
          #effect.move { animation: hold .7s ease-out forwards; }
          #effect.move::after { animation: breathe .7s ease-out forwards; }
          #effect.click, #effect.scroll, #effect.drag { animation: hold .85s ease-out forwards; }
          #effect.click::after, #effect.scroll::after { animation: ripple .72s cubic-bezier(.16,.84,.32,1) forwards; }
          #effect.drag::after { animation: drag-pulse .82s cubic-bezier(.16,.84,.32,1) forwards; }
          @keyframes hold { 0% { opacity: 0; transform: scale(.55); } 14% { opacity: 1; transform: scale(1); } 70% { opacity: 1; } 100% { opacity: 0; transform: scale(.9); } }
          @keyframes breathe { 0% { transform: scale(.55); opacity: 0; } 25% { transform: scale(1); opacity: .9; } 100% { transform: scale(1.35); opacity: 0; } }
          @keyframes ripple { 0% { transform: scale(.45); opacity: 1; border-width: 3px; } 100% { transform: scale(2.45); opacity: 0; border-width: 1px; } }
          @keyframes drag-pulse { 0% { transform: scale(.5); opacity: 1; } 45% { transform: scale(1.5); opacity: .9; } 100% { transform: scale(2.1); opacity: 0; } }
          @media (prefers-reduced-motion: reduce) { #effect, #effect::after { animation-duration: .18s !important; } }
        </style>
      </head>
      <body>
        <div id="effect"></div>
        <script>
          globalThis.playDesktopControlEffect = (kind) => {
            const effect = document.getElementById('effect')
            effect.className = ''
            void effect.offsetWidth
            effect.className = kind
          }
        </script>
      </body>
    </html>
  `)}`)
  window.on('closed', () => {
    effectWindow = undefined
  })
  return window
}

/** Shows a click-through blue cursor effect after a successful desktop mouse action. */
export async function showDesktopControlEffect(action: DesktopControlAction, result: DesktopControlResult): Promise<void> {
  const kind = effectKind(action)
  if (!kind)
    return

  const window = effectWindow && !effectWindow.isDestroyed()
    ? effectWindow
    : (effectWindow = createEffectWindow())

  if (window.webContents.isLoading())
    await new Promise<void>(resolve => window.webContents.once('did-finish-load', () => resolve()))

  window.setPosition(
    Math.round(result.cursor.x - effectWindowSize / 2),
    Math.round(result.cursor.y - effectWindowSize / 2),
    false,
  )
  window.showInactive()
  await window.webContents.executeJavaScript(`globalThis.playDesktopControlEffect(${JSON.stringify(kind)})`)

  if (hideTimer)
    clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    if (!window.isDestroyed())
      window.hide()
  }, 900)
}

onAppBeforeQuit(() => {
  if (hideTimer)
    clearTimeout(hideTimer)
  if (effectWindow && !effectWindow.isDestroyed())
    effectWindow.destroy()
  effectWindow = undefined
})
