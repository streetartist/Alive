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
        expressionList: vi.fn(async () => ({
          modelId: 'KITU_RE23.model3.json',
          groups: [
            {
              name: 'Frightened',
              active: false,
              exposedToLlm: true,
              parameters: [{ parameterId: 'ParamFrightened', blend: 'Add', value: 1 }],
            },
          ],
          llmMode: 'all',
          llmExposed: {},
        })),
        expressionSet: vi.fn(async payload => ({
          ok: true,
          result: { success: true, payload },
          expressions: { modelId: 'KITU_RE23.model3.json', groups: [], llmMode: 'all', llmExposed: {} },
        })),
        expressionToggle: vi.fn(async payload => ({
          ok: true,
          result: { success: true, payload },
          expressions: { modelId: 'KITU_RE23.model3.json', groups: [], llmMode: 'all', llmExposed: {} },
        })),
        expressionResetAll: vi.fn(async () => ({
          ok: true,
          result: { success: true },
          expressions: { modelId: 'KITU_RE23.model3.json', groups: [], llmMode: 'all', llmExposed: {} },
        })),
        expressionSaveDefaults: vi.fn(async () => ({
          ok: true,
          result: { success: true },
          expressions: { modelId: 'KITU_RE23.model3.json', groups: [], llmMode: 'all', llmExposed: {} },
        })),
        expressionSetLlmMode: vi.fn(async payload => ({
          ok: true,
          result: { success: true, payload },
          expressions: { modelId: 'KITU_RE23.model3.json', groups: [], llmMode: payload.mode, llmExposed: {} },
        })),
        expressionSetLlmExposed: vi.fn(async payload => ({
          ok: true,
          result: { success: true, payload },
          expressions: { modelId: 'KITU_RE23.model3.json', groups: [], llmMode: 'custom', llmExposed: { [payload.name]: payload.enabled } },
        })),
        live2dViewGet: vi.fn(async () => ({
          position: { x: 0, y: 0 },
          scale: 1,
        })),
        live2dViewSet: vi.fn(async payload => ({
          position: { x: payload.x ?? 0, y: payload.y ?? 0 },
          scale: payload.scale ?? 1,
        })),
        live2dViewReset: vi.fn(async () => ({
          position: { x: 0, y: 0 },
          scale: 1,
        })),
        live2dMotionList: vi.fn(async () => ({
          current: { group: 'Idle', index: 0 },
          available: [{ motionName: 'Idle', motionIndex: 0, fileName: 'idle.motion3.json' }],
        })),
        live2dMotionPlay: vi.fn(async payload => ({
          current: { group: payload.group, index: payload.index },
          available: [{ motionName: 'Idle', motionIndex: 0, fileName: 'idle.motion3.json' }],
        })),
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

  it('requires a message id or index when deleting chat messages', async () => {
    const options = createOptions()
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/chat/messages`, {
      method: 'DELETE',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sessionId: 's1' }),
    })

    expect(response.status).toBe(400)
    expect(options.renderer.chatDeleteMessage).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({
      error: {
        code: 'FIELD_REQUIRED',
      },
    })
  })

  it('rejects invalid provider kinds for active provider reads', async () => {
    const options = createOptions()
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/providers/not-a-kind/active`, {
      headers: authHeaders(),
    })

    expect(response.status).toBe(400)
    expect(options.renderer.getProviderStatus).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({
      error: {
        code: 'PROVIDER_KIND_INVALID',
      },
    })
  })

  it('forwards Live2D expression list requests to the renderer', async () => {
    const options = createOptions()
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/live2d/expressions`, {
      headers: authHeaders(),
    })

    expect(response.status).toBe(200)
    expect(options.renderer.expressionList).toHaveBeenCalledOnce()
    expect(await response.json()).toMatchObject({
      modelId: 'KITU_RE23.model3.json',
      groups: [
        {
          name: 'Frightened',
          active: false,
          exposedToLlm: true,
        },
      ],
      llmMode: 'all',
    })
  })

  it('forwards Live2D expression toggle requests and publishes operation events', async () => {
    const options = createOptions()
    const operations: unknown[] = []
    options.events.subscribe((event) => {
      if (event.type === 'operation')
        operations.push(event.payload)
    })
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/live2d/expressions/toggle`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: 'Frightened', duration: 3 }),
    })

    expect(response.status).toBe(200)
    expect(options.renderer.expressionToggle).toHaveBeenCalledWith({ name: 'Frightened', duration: 3 })
    expect(operations).toContainEqual({ operation: 'live2d.expression.toggle', payload: { name: 'Frightened', duration: 3 } })
  })

  it('rejects invalid Live2D expression set values before calling the renderer', async () => {
    const options = createOptions()
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/live2d/expressions/set`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: 'Frightened', value: { invalid: true } }),
    })

    expect(response.status).toBe(400)
    expect(options.renderer.expressionSet).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({
      error: {
        code: 'FIELD_INVALID',
      },
    })
  })

  it('forwards Live2D view set requests and publishes operation events', async () => {
    const options = createOptions()
    const operations: unknown[] = []
    options.events.subscribe((event) => {
      if (event.type === 'operation')
        operations.push(event.payload)
    })
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/live2d/view/set`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ x: 12.5, y: -8, scale: 1.2 }),
    })

    expect(response.status).toBe(200)
    expect(options.renderer.live2dViewSet).toHaveBeenCalledWith({ x: 12.5, y: -8, scale: 1.2 })
    expect(operations).toContainEqual({ operation: 'live2d.view.set', payload: { x: 12.5, y: -8, scale: 1.2 } })
    expect(await response.json()).toEqual({
      position: { x: 12.5, y: -8 },
      scale: 1.2,
    })
  })

  it('rejects empty Live2D view set requests before calling the renderer', async () => {
    const options = createOptions()
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/live2d/view/set`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
    expect(options.renderer.live2dViewSet).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({
      error: {
        code: 'FIELD_REQUIRED',
      },
    })
  })

  it('validates Live2D view reset controls before calling the renderer', async () => {
    const options = createOptions()
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/live2d/view/reset`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ controls: ['x', 'bad'] }),
    })

    expect(response.status).toBe(400)
    expect(options.renderer.live2dViewReset).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({
      error: {
        code: 'FIELD_INVALID',
      },
    })
  })

  it('forwards Live2D motion play requests to the renderer', async () => {
    const options = createOptions()
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/live2d/motions/play`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ group: 'Idle', index: 0 }),
    })

    expect(response.status).toBe(200)
    expect(options.renderer.live2dMotionPlay).toHaveBeenCalledWith({ group: 'Idle', index: 0 })
    expect(await response.json()).toMatchObject({
      current: { group: 'Idle', index: 0 },
    })
  })

  it('rejects invalid Live2D motion indexes before calling the renderer', async () => {
    const options = createOptions()
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/live2d/motions/play`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ group: 'Idle', index: 0.5 }),
    })

    expect(response.status).toBe(400)
    expect(options.renderer.live2dMotionPlay).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({
      error: {
        code: 'FIELD_INVALID',
      },
    })
  })

  it('validates Godot view patches before forwarding them to the manager', async () => {
    const options = createOptions()
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/stage/godot/view`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ camera: { position: { x: 1 }, yawDeg: 15 } }),
    })

    expect(response.status).toBe(200)
    expect(options.godot.applyViewPatch).toHaveBeenCalledWith({
      camera: {
        position: { x: 1 },
        yawDeg: 15,
      },
    })
    expect(await response.json()).toEqual({ requestId: 'r1' })
  })

  it('rejects empty Godot view patches before calling the manager', async () => {
    const options = createOptions()
    await listen(options)

    const response = await fetch(`${baseUrl}/v1/stage/godot/view`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ camera: {} }),
    })

    expect(response.status).toBe(400)
    expect(options.godot.applyViewPatch).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({
      error: {
        code: 'FIELD_INVALID',
      },
    })
  })
})
