import type { Server } from 'node:http'

import type { ControlApiRouteOptions } from './route'

import { createServer } from 'node:http'

import { toNodeHandler } from 'h3/node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createControlApiEventBus } from './event-bus'
import { createControlApiApp } from './route'

describe('createControlApiApp', () => {
  const token = 'test-control-token'
  let server: Server | undefined
  let baseUrl = ''

  function createOptions(): ControlApiRouteOptions {
    const events = createControlApiEventBus()

    return {
      authToken: token,
      events,
      getAddress: () => ({ host: '127.0.0.1', port: 6122, baseUrl: 'http://127.0.0.1:6122' }),
      renderer: {
        getStatus: vi.fn(async () => ({ ready: true })),
        chatSend: vi.fn(async () => undefined),
        chatSpotlight: vi.fn(async () => ({ sessionId: 's1', visibleText: 'hello' })),
        chatRetry: vi.fn(async () => undefined),
        chatCleanup: vi.fn(async () => undefined),
        chatInterrupt: vi.fn(async () => ({ queuedSendsCancelled: true })),
        chatDeleteMessage: vi.fn(async () => undefined),
        chatListSessions: vi.fn(async () => ({ activeSessionId: 's1', sessions: [] })),
        chatCreateSession: vi.fn(async () => ({ sessionId: 's2' })),
        chatSelectSession: vi.fn(async () => undefined),
        chatGetMessages: vi.fn(async () => ({ sessionId: 's1', messages: [] })),
        getProviderStatus: vi.fn(async () => ({ active: {}, available: {}, configured: {} })),
        setActiveProvider: vi.fn(async () => ({ active: {}, available: {}, configured: {} })),
        getProviderModels: vi.fn(async payload => ({ providerId: payload.providerId, models: [] })),
        speechSynthesize: vi.fn(async () => ({ contentType: 'audio/wav', byteLength: 0, audioBase64: '' })),
      },
      windows: {
        openMain: vi.fn(async () => undefined),
        hideMain: vi.fn(async () => undefined),
        focusMain: vi.fn(async () => undefined),
        openChat: vi.fn(async () => undefined),
        openSettings: vi.fn(async () => undefined),
        openWidgets: vi.fn(async () => undefined),
        hideWidgets: vi.fn(async () => undefined),
        openSpotlight: vi.fn(async () => undefined),
      },
      mcp: {
        getRuntimeStatus: vi.fn(() => ({ servers: [] })),
        listTools: vi.fn(async () => []),
        callTool: vi.fn(async () => ({ content: [] })),
        readConfigText: vi.fn(async () => ({ path: 'mcp.json', text: '{}' })),
        writeConfigText: vi.fn(async text => ({ path: 'mcp.json', text })),
        applyAndRestart: vi.fn(async () => ({ started: [], failed: [], skipped: [] })),
        testServer: vi.fn(async () => ({ ok: true, durationMs: 1 })),
      },
      widgets: {
        listWidgets: vi.fn(() => []),
        openWindow: vi.fn(async () => undefined),
        hideWindow: vi.fn(async () => undefined),
        pushWidget: vi.fn(async () => 'widget-id'),
        updateWidget: vi.fn(async () => undefined),
        removeWidget: vi.fn(async () => undefined),
        clearWidgets: vi.fn(async () => undefined),
        publishWidgetEvent: vi.fn(() => undefined),
      },
      godot: {
        getStatus: vi.fn(() => ({ state: 'stopped' })),
        start: vi.fn(async () => ({ state: 'running' })),
        stop: vi.fn(async () => ({ state: 'stopped' })),
        getViewSnapshot: vi.fn(() => null),
        applyViewPatch: vi.fn(async () => ({ requestId: 'r1' })),
        requestViewSnapshot: vi.fn(async () => ({ requestId: 'r1' })),
      },
      plugins: {
        list: vi.fn(async () => ({ plugins: [] })),
        loadEnabled: vi.fn(async () => ({ plugins: [] })),
        load: vi.fn(async () => ({ plugins: [] })),
        unload: vi.fn(async () => ({ plugins: [] })),
        setEnabled: vi.fn(async () => ({ plugins: [] })),
        setAutoReload: vi.fn(async () => ({ plugins: [] })),
        inspect: vi.fn(async () => ({ refreshedAt: 0 })),
        listTools: vi.fn(async () => []),
        invokeTool: vi.fn(async () => ({ ok: true })),
      },
    }
  }

  async function listen(options: ControlApiRouteOptions) {
    if (server) {
      await new Promise<void>(resolve => server!.close(() => resolve()))
      server = undefined
    }

    server = createServer(toNodeHandler(createControlApiApp(options)))
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    baseUrl = `http://127.0.0.1:${port}`
  }

  function authHeaders(extra?: Record<string, string>): HeadersInit {
    return {
      Authorization: `Bearer ${token}`,
      ...extra,
    }
  }

  beforeEach(async () => {
    await listen(createOptions())
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve()
        return
      }

      server.close(() => resolve())
      server = undefined
    })
  })

  it('allows health checks without a bearer token', async () => {
    const response = await fetch(`${baseUrl}/v1/health`)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      service: 'airi-local-control-api',
      localOnly: true,
    })
  })

  it('requires bearer auth for protected routes', async () => {
    const response = await fetch(`${baseUrl}/v1/status`)

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      error: {
        code: 'AUTHORIZATION_REQUIRED',
      },
    })
  })

  it('rejects non-local origins even with a valid token', async () => {
    const response = await fetch(`${baseUrl}/v1/status`, {
      headers: authHeaders({ Origin: 'http://evil.example' }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: {
        code: 'ORIGIN_NOT_LOCAL',
      },
    })
  })

  it('responds to local CORS preflight requests', async () => {
    const response = await fetch(`${baseUrl}/v1/status`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000' },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization')
  })

  it('forwards chat send requests and publishes operation events', async () => {
    const options = createOptions()
    const operations: unknown[] = []
    options.events.subscribe((event) => {
      if (event.type === 'operation')
        operations.push(event.payload)
    })
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/chat/send`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text: 'hello', sessionId: 's1', toolset: 'artistry' }),
    })

    expect(response.status).toBe(200)
    expect(options.renderer.chatSend).toHaveBeenCalledWith({ text: 'hello', sessionId: 's1', toolset: 'artistry' })
    expect(operations).toContainEqual({ operation: 'chat.send', payload: { sessionId: 's1' } })
  })

  it('maps MCP tool call arguments from JSON body', async () => {
    const options = createOptions()
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: 'server::tool', arguments: { query: 'weather' } }),
    })

    expect(response.status).toBe(200)
    expect(options.mcp.callTool).toHaveBeenCalledWith({
      name: 'server::tool',
      arguments: { query: 'weather' },
    })
  })
})
