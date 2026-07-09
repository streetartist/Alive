export interface ControlApiEventEnvelope<TPayload = unknown> {
  id: number
  type: string
  payload: TPayload
  timestamp: string
}

export interface ControlApiEventBus {
  publish: <TPayload>(type: string, payload: TPayload) => ControlApiEventEnvelope<TPayload>
  subscribe: (listener: (event: ControlApiEventEnvelope) => void) => () => void
}

/**
 * Creates the in-memory event fan-out used by the local control API SSE stream.
 *
 * Events are runtime-only and intentionally not persisted; clients that reconnect
 * should query the matching snapshot endpoints for current state.
 */
export function createControlApiEventBus(): ControlApiEventBus {
  const listeners = new Set<(event: ControlApiEventEnvelope) => void>()
  let nextId = 1

  return {
    publish(type, payload) {
      const event = {
        id: nextId++,
        type,
        payload,
        timestamp: new Date().toISOString(),
      }

      for (const listener of listeners)
        listener(event)

      return event
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function createControlApiSseStream(events: ControlApiEventBus) {
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk))
      }
      unsubscribe = events.subscribe((event) => {
        write(`id: ${event.id}\n`)
        write(`event: ${event.type}\n`)
        write(`data: ${JSON.stringify(event)}\n\n`)
      })

      write(': connected\n\n')
    },
    cancel() {
      unsubscribe?.()
      unsubscribe = undefined
    },
  })
}
