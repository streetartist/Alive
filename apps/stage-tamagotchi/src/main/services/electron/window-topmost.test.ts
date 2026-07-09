import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyStageAlwaysOnTop, createStageAlwaysOnTopController } from './window-topmost'

type WindowEvent = 'focus' | 'restore' | 'show'

function createWindowMock() {
  const listeners = new Map<WindowEvent, Set<() => void>>()

  return {
    emit(event: WindowEvent) {
      listeners.get(event)?.forEach(listener => listener())
    },
    moveTop: vi.fn(),
    off: vi.fn((event: WindowEvent, listener: () => void) => {
      listeners.get(event)?.delete(listener)
    }),
    on: vi.fn((event: WindowEvent, listener: () => void) => {
      const eventListeners = listeners.get(event) ?? new Set<() => void>()
      eventListeners.add(listener)
      listeners.set(event, eventListeners)
    }),
    setAlwaysOnTop: vi.fn(),
  }
}

describe('stage always-on-top controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies the screen-saver topmost layer and moves the window to the top', () => {
    const window = createWindowMock()

    applyStageAlwaysOnTop(window)

    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver', 1)
    expect(window.moveTop).toHaveBeenCalledOnce()
  })

  it('reasserts topmost state while enabled and stops when disabled', () => {
    const window = createWindowMock()
    const controller = createStageAlwaysOnTopController(window, {
      reassertIntervalMs: 100,
    })

    controller.setEnabled(true)

    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver', 1)
    expect(window.moveTop).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(100)

    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver', 1)
    expect(window.moveTop).toHaveBeenCalledTimes(2)

    controller.setEnabled(false)
    vi.advanceTimersByTime(300)

    expect(window.setAlwaysOnTop).toHaveBeenLastCalledWith(false)
    expect(window.moveTop).toHaveBeenCalledTimes(2)
  })

  it('delays a lifecycle reassert so external window layer changes can settle', () => {
    const window = createWindowMock()
    const controller = createStageAlwaysOnTopController(window, {
      reassertDelayMs: 50,
      reassertIntervalMs: 1000,
    })

    controller.setEnabled(true)
    window.emit('show')

    expect(window.moveTop).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(50)

    expect(window.moveTop).toHaveBeenCalledTimes(2)
  })

  it('removes lifecycle listeners and clears pending reasserts on dispose', () => {
    const window = createWindowMock()
    const controller = createStageAlwaysOnTopController(window, {
      reassertDelayMs: 50,
      reassertIntervalMs: 100,
    })

    controller.setEnabled(true)
    window.emit('focus')
    controller.dispose()
    vi.advanceTimersByTime(200)

    expect(window.off).toHaveBeenCalledTimes(3)
    expect(window.moveTop).toHaveBeenCalledTimes(1)
  })
})
