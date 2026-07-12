# Stage Tamagotchi 本地控制 API

Stage Tamagotchi 桌面端在 Electron main 进程内提供一个本地 HTTP API，用于从脚本、自动化工具或本机其他进程控制 AIRI。该 API 只绑定 loopback 地址，不对局域网或公网开放。

## 基础信息

- Base URL: `http://127.0.0.1:6122`
- API version: `v1`
- 默认监听地址: `127.0.0.1`
- 默认端口: `6122`
- 鉴权方式: `Authorization: Bearer <token>`
- 免鉴权端点: `GET /v1/health`
- 主要实现:
  - `apps/stage-tamagotchi/src/main/services/airi/control-api`
  - `apps/stage-tamagotchi/src/shared/eventa/control-api.ts`
  - `apps/stage-tamagotchi/src/renderer/bridges/control-api.ts`

## 启用和配置

默认启用。配置文件位于 Electron `app.getPath('userData')` 下:

```text
<userData>/control-api-config.json
```

开发环境 Windows 常见路径:

```text
%APPDATA%\@proj-airi\stage-tamagotchi\control-api-config.json
```

安装包环境 Windows 常见路径:

```text
%APPDATA%\ai.moeru.airi\control-api-config.json
```

配置文件格式:

```json
{
  "enabled": true,
  "port": 6122,
  "authToken": "generated-or-user-provided-token"
}
```

环境变量会覆盖配置文件:

| 环境变量 | 说明 |
| --- | --- |
| `AIRI_CONTROL_API_ENABLED` | `1/true/yes/on` 启用, `0/false/no/off` 禁用 |
| `AIRI_CONTROL_API_PORT` | 本地监听端口, 1 到 65535 |
| `AIRI_CONTROL_API_TOKEN` | Bearer token; 使用环境变量时不会写回配置文件 |

如果配置文件没有 token, 应用会生成 UUID token 并写入配置。

## 安全模型

1. 服务只绑定 `127.0.0.1`。
2. 所有 `/v1/**` 请求都会检查 `Host` header, 只接受 `localhost`, `127.0.0.1`, `::1`。
3. 如果请求带 `Origin`, 只接受 loopback origin。
4. 除 `/v1/health` 外，所有端点必须带 Bearer token。
5. CORS 只对本地 origin 回显 `Access-Control-Allow-Origin`。
6. 响应默认带:
   - `Cache-Control: no-store`
   - `Referrer-Policy: no-referrer`
   - `X-Content-Type-Options: nosniff`

## 快速调用

PowerShell:

```powershell
$config = Get-Content "$env:APPDATA\@proj-airi\stage-tamagotchi\control-api-config.json" -Raw | ConvertFrom-Json
$headers = @{ Authorization = "Bearer $($config.authToken)" }

Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:$($config.port)/v1/status" `
  -Headers $headers
```

发送一条聊天消息:

```powershell
$body = @{ text = "你好, 这是一条来自本地 API 的消息。" } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:$($config.port)/v1/chat/send" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

curl:

```bash
curl http://127.0.0.1:6122/v1/status \
  -H "Authorization: Bearer $AIRI_CONTROL_API_TOKEN"
```

## 通用响应

成功响应一般是 JSON。没有业务返回值的操作返回:

```json
{
  "ok": true
}
```

错误响应:

```json
{
  "error": {
    "code": "FIELD_REQUIRED",
    "message": "Field \"text\" must be a non-empty string.",
    "details": {}
  }
}
```

常见错误码:

| HTTP | code | 说明 |
| --- | --- | --- |
| `400` | `JSON_INVALID` | body 不是合法 JSON |
| `400` | `JSON_OBJECT_REQUIRED` | body 不是 JSON object |
| `400` | `FIELD_REQUIRED` | 必填字段缺失或为空 |
| `400` | `FIELD_INVALID` | 字段类型不匹配 |
| `400` | `PROVIDER_KIND_INVALID` | provider kind 不在允许列表内 |
| `401` | `AUTHORIZATION_REQUIRED` | 缺少 Bearer token |
| `401` | `AUTHORIZATION_INVALID` | token 无效 |
| `403` | `HOST_NOT_LOCAL` | Host 不是本地地址 |
| `403` | `ORIGIN_NOT_LOCAL` | Origin 不是本地地址 |
| `404` | `NOT_FOUND` | 路由或路径参数无效 |
| `404` | `PLUGINS_UNAVAILABLE` | 插件控制面不可用 |
| `500` | `INTERNAL_ERROR` | 控制面或被调用模块抛错 |

## 数据类型

### Chat

```ts
type ControlApiToolsetId = 'widgets' | 'artistry'

interface ControlApiAttachmentPayload {
  type: 'image'
  data: string
  mimeType: string
}

interface ControlApiChatSendRequest {
  text: string
  attachments?: ControlApiAttachmentPayload[]
  sessionId?: string
  toolset?: ControlApiToolsetId
}
```

`sessionId` 省略时使用当前 active session。`attachments` 当前用于图片输入。

### Provider

```ts
type ControlApiProviderKind = 'chat' | 'speech' | 'transcription' | 'vision'

interface ControlApiProviderActiveSelection {
  providerId: string
  modelId: string
  configured: boolean
}

interface ControlApiProviderSetActiveRequest {
  kind: ControlApiProviderKind
  providerId: string
  modelId?: string
  loadModels?: boolean
}
```

### Speech

```ts
interface ControlApiSpeechSynthesizeRequest {
  text: string
  providerId?: string
  modelId?: string
  voiceId?: string
  forceSSML?: boolean
}

interface ControlApiSpeechSynthesizeResponse {
  contentType: string
  byteLength: number
  audioBase64: string
}
```

`POST /v1/speech/synthesize` 只返回音频数据，不负责播放。聊天回复是否自动播报由 AIRI renderer 的语音设置和聊天流程决定。

### Live2D expressions

```ts
type ControlApiExpressionBlendMode = 'Add' | 'Multiply' | 'Overwrite'
type ControlApiExpressionLlmMode = 'all' | 'none' | 'custom'

interface ControlApiExpressionSnapshot {
  modelId: string
  groups: Array<{
    name: string
    active: boolean
    exposedToLlm: boolean
    parameters: Array<{
      parameterId: string
      blend: ControlApiExpressionBlendMode
      value: number
    }>
  }>
  llmMode: ControlApiExpressionLlmMode
  llmExposed: Record<string, boolean>
}

interface ControlApiExpressionSetRequest {
  name: string
  value: boolean | number
  duration?: number
}
```

Live2D expression 控制依赖当前主舞台 renderer 已加载 Live2D 模型，并且模型本身有 expression 定义。`duration` 单位是秒，省略时保持当前设置直到下次操作或模型重载。

### MCP

```ts
interface ElectronMcpStdioServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled?: boolean
}

interface ElectronMcpCallToolPayload {
  name: string
  arguments?: Record<string, unknown>
}
```

### Widgets

```ts
type WidgetGridSize = 's' | 'm' | 'l' | { cols?: number, rows?: number }

interface WidgetsAddPayload {
  id?: string
  componentName: string
  componentProps?: Record<string, unknown>
  alwaysOnTop?: boolean
  size?: WidgetGridSize
  windowSize?: Record<string, unknown>
  ttlMs?: number
}

interface WidgetsUpdatePayload {
  id: string
  componentProps?: Record<string, unknown>
  alwaysOnTop?: boolean
  size?: WidgetGridSize
  windowSize?: Record<string, unknown>
  ttlMs?: number
}
```

`componentName` 必须是当前 widgets renderer 已注册的组件名。

### Godot stage view patch

```ts
interface StageViewVec3 {
  x: number
  y: number
  z: number
}

interface StageCameraPosePatch {
  position?: Partial<StageViewVec3>
  yawDeg?: number
  pitchDeg?: number
  fovDeg?: number
}

interface StageViewPatch {
  camera?: StageCameraPosePatch
}
```

patch 至少包含一个实际字段。

## System

### `GET /v1/health`

健康检查。免鉴权，但仍要求本地 Host/Origin。

Response:

```json
{
  "ok": true,
  "service": "airi-local-control-api",
  "version": "v1",
  "localOnly": true,
  "authRequired": true
}
```

### `GET /v1/capabilities`

返回当前控制面能力列表、鉴权信息和限制说明。

### `GET /v1/status`

返回控制 API、renderer、MCP、Godot、widgets 的快照。

Response shape:

```json
{
  "service": "airi-local-control-api",
  "address": {
    "host": "127.0.0.1",
    "port": 6122,
    "baseUrl": "http://127.0.0.1:6122"
  },
  "renderer": {
    "ready": true,
    "route": "/",
    "chat": {
      "activeSessionId": "...",
      "sending": false,
      "pendingQueuedSendCount": 0
    },
    "providers": {}
  },
  "mcp": {},
  "godot": {},
  "widgets": []
}
```

### `GET /v1/events`

Server-Sent Events stream。连接需要鉴权。

SSE frame:

```text
id: 1
event: operation
data: {"id":1,"type":"operation","payload":{"operation":"chat.send"},"timestamp":"2026-07-09T00:00:00.000Z"}
```

事件 envelope:

```ts
interface ControlApiEventEnvelope<TPayload = unknown> {
  id: number
  type: string
  payload: TPayload
  timestamp: string
}
```

已知事件类型:

| type | payload |
| --- | --- |
| `operation` | `{ operation: string, payload?: unknown }` |
| `godot.status` | Godot stage runtime status |
| `godot.view.snapshot` | Godot view snapshot |
| `godot.view.error` | Godot view error |
| `widgets.event` | Widget event payload |

断线重连后不会补发历史事件。客户端应重新调用 snapshot 端点同步状态。

## Alive 伴侣记忆

这些端点作用于当前用户和角色组成的 scope；所有状态与记忆均同时按用户和角色隔离。

### `GET /v1/alive/profile`

返回当前伴侣身份、关系创建时间、演化中的人格维度与成长阶段。

`identity.birthday` 是当前用户与角色的持久化关系生日；`identity.interests` 与 `identity.values` 来自独立的本地身份档案，不会写回或修改 AIRI Card。

```json
{
  "identity": {
    "id": "character-id",
    "name": "Alive",
    "birthday": "2026-07-11T00:00:00.000Z",
    "interests": ["painting"],
    "values": ["patient curiosity"]
  },
  "personality": {
    "curiosity": 0.6,
    "creativity": 0.5,
    "kindness": 0.5,
    "humor": 0.5
  },
  "growthStage": "child"
}
```

### `GET /v1/alive/state`

返回完整持久化伴侣状态，并在存在长期记忆时附带最新一条记录。

响应中的 `state.mood` 是持久化的情绪时间锚点；顶层 `mood` 是请求时按惰性指数衰减解析出的当前投影：

```json
{
  "state": {
    "schemaVersion": 3,
    "growthPoints": 12,
    "importantMemoryCount": 1,
    "positiveFeedbackCount": 2,
    "negativeFeedbackCount": 0,
    "mood": {
      "valence": 0.02,
      "arousal": 0.33,
      "updatedAt": 1780000000000
    }
  },
  "mood": {
    "label": "neutral",
    "valence": 0.01,
    "arousal": 0.28,
    "updatedAt": 1780000000000,
    "resolvedAt": 1780003600000
  }
}
```

长期 mood 只由完成并写入 durable memory 的交互和未来的显式用户反馈更新。ACT、Live2D 表情、Desktop Life 和回复表演推断不会修改它。

### `GET /v1/alive/memory`

按从新到旧的顺序列出当前伴侣 scope 的长期记忆。

Memory records use schema v2. Conversation turns begin as neutral
`experience` records. `fact`, `emotion`, and `milestone` kinds plus
`importance` and `emotionalWeight` are explicit annotations rather than model
inference.

```json
{
  "records": [
    {
      "schemaVersion": 2,
      "id": "turn:session:message",
      "kind": "milestone",
      "importance": 1,
      "emotionalWeight": 0.6,
      "content": "User: ...\nAIRI: ..."
    }
  ]
}
```

### `POST /v1/alive/reflection`

立即执行一次反思。当前聊天 provider 会分析经过长度限制且明确标记为不可信数据的记忆证据。如果 provider 或记忆不可用，端点会改为写入本地检查点，并返回 `mode: "local"` 与 `fallbackReason`。

响应结构：

```json
{
  "mode": "model",
  "state": {
    "interactionCount": 10,
    "lastReflectedInteractionCount": 10,
    "growthStage": "child"
  },
  "reflection": {
    "learned": ["The user may enjoy creative discussions"],
    "personalityChanges": {
      "curiosity": 0.02
    }
  }
}
```

每完成十轮交互会自动触发相同的反思流程。反思在本轮对话写入长期记忆之后运行，因此检查点不会错误声称覆盖尚未分析的对话。

## Chat

### `POST /v1/chat/send`

向当前或指定会话发送一条消息。该端点会复用 AIRI 现有聊天流程，因此可能触发工具调用、聊天 UI 更新和语音播报。

Request:

```json
{
  "text": "你好",
  "sessionId": "optional-session-id",
  "toolset": "widgets",
  "attachments": [
    {
      "type": "image",
      "data": "base64-or-renderer-supported-image-data",
      "mimeType": "image/png"
    }
  ]
}
```

Response:

```json
{ "ok": true }
```

### `POST /v1/chat/spotlight`

通过 spotlight 聊天入口发送文本。

Request:

```json
{
  "text": "打开 spotlight 并处理这句话"
}
```

Response:

```json
{
  "sessionId": "...",
  "visibleText": "..."
}
```

### `POST /v1/chat/interrupt`

取消排队中的发送并重置前台 stream。

Request:

```json
{
  "sessionId": "optional-session-id"
}
```

Response:

```json
{
  "queuedSendsCancelled": true,
  "foregroundStreamReset": true,
  "activeProviderRequestAbortSupported": false
}
```

限制: 已经发给 provider 的请求目前不能被强制 abort。

### `POST /v1/chat/retry`

重试指定消息索引。

Request:

```json
{
  "sessionId": "optional-session-id",
  "index": 3
}
```

Response:

```json
{ "ok": true }
```

### `POST /v1/chat/cleanup`

清理会话消息。

Request:

```json
{
  "sessionId": "optional-session-id"
}
```

Response:

```json
{ "ok": true }
```

### `DELETE /v1/chat/messages`

删除一条消息。可按 `messageId` 或 `index` 删除。

Request:

```json
{
  "sessionId": "optional-session-id",
  "messageId": "optional-message-id",
  "index": 2
}
```

Response:

```json
{ "ok": true }
```

### `GET /v1/chat/sessions`

列出会话。

Response shape:

```json
{
  "activeSessionId": "...",
  "sessions": [
    {
      "meta": {},
      "messageCount": 10,
      "loaded": true
    }
  ]
}
```

### `POST /v1/chat/sessions`

创建会话。

Request:

```json
{
  "characterId": "optional-character-id",
  "title": "optional-title",
  "setActive": true
}
```

Response:

```json
{
  "sessionId": "..."
}
```

### `POST /v1/chat/sessions/{sessionId}/select`

切换当前 active session。

Response:

```json
{ "ok": true }
```

### `GET /v1/chat/sessions/{sessionId}/messages`

获取指定会话消息。

Response:

```json
{
  "sessionId": "...",
  "messages": []
}
```

### `GET /v1/chat/messages`

获取当前 active session 消息。

Response:

```json
{
  "sessionId": "...",
  "messages": []
}
```

## Providers

### `GET /v1/providers`

获取 provider 状态。

Response shape:

```json
{
  "active": {
    "chat": {
      "providerId": "openai-compatible",
      "modelId": "MiniMax-M3",
      "configured": true
    }
  },
  "available": {
    "chat": []
  },
  "configured": {
    "chat": []
  }
}
```

### `GET /v1/providers/{kind}/active`

获取某类 provider 的 active selection。

Allowed `kind`:

- `chat`
- `speech`
- `transcription`
- `vision`

### `POST /v1/providers/{kind}/active`

设置某类 provider 的 active selection。

Request:

```json
{
  "providerId": "openai-compatible",
  "modelId": "MiniMax-M3",
  "loadModels": true
}
```

Response: provider status snapshot。

### `GET /v1/providers/models/{providerId}`

获取 provider 的模型列表。

Response:

```json
{
  "providerId": "openai-compatible",
  "models": []
}
```

## Speech

### `POST /v1/speech/synthesize`

调用当前或指定 speech provider 合成语音，返回 base64 音频。

Request:

```json
{
  "text": "语音测试成功。",
  "providerId": "optional-provider-id",
  "modelId": "optional-model-id",
  "voiceId": "optional-voice-id",
  "forceSSML": false
}
```

Response:

```json
{
  "contentType": "audio/mpeg",
  "byteLength": 12345,
  "audioBase64": "..."
}
```

PowerShell 保存音频:

```powershell
$body = @{ text = "语音测试成功。" } | ConvertTo-Json
$audio = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:$($config.port)/v1/speech/synthesize" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body

[IO.File]::WriteAllBytes("speech.mp3", [Convert]::FromBase64String($audio.audioBase64))
```

## Live2D Expressions

### `GET /v1/live2d/expressions`

列出当前 Live2D 模型可用的 expression groups、参数、激活状态和 LLM 暴露设置。

Response shape:

```json
{
  "modelId": "KITU_RE23.model3.json",
  "groups": [
    {
      "name": "Frightened",
      "active": false,
      "exposedToLlm": true,
      "parameters": [
        {
          "parameterId": "ParamFrightened",
          "blend": "Add",
          "value": 1
        }
      ]
    }
  ],
  "llmMode": "all",
  "llmExposed": {}
}
```

### `POST /v1/live2d/expressions/set`

设置指定 expression group 或参数值。

Request:

```json
{
  "name": "Frightened",
  "value": true,
  "duration": 3
}
```

Response shape:

```json
{
  "ok": true,
  "result": {
    "success": true
  },
  "expressions": {}
}
```

### `POST /v1/live2d/expressions/toggle`

切换指定 expression group 或参数。对于 group，会在模型默认值和 exp3 目标值之间切换。

Request:

```json
{
  "name": "Frightened",
  "duration": 3
}
```

PowerShell:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:$($config.port)/v1/live2d/expressions/toggle" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ name = "Frightened"; duration = 3 } | ConvertTo-Json)
```

### `POST /v1/live2d/expressions/reset`

重置所有 expression 到模型默认值。

### `POST /v1/live2d/expressions/save-defaults`

把当前 expression 参数值保存为本地默认值。默认值按 `modelId` 存储。

### `POST /v1/live2d/expressions/llm-mode`

设置 expression 是否暴露给 LLM tool。

Request:

```json
{
  "mode": "custom"
}
```

Allowed `mode`:

- `all`
- `none`
- `custom`

### `POST /v1/live2d/expressions/llm-exposed`

设置 custom 模式下某个 expression group 是否暴露给 LLM tool。

Request:

```json
{
  "name": "Frightened",
  "enabled": true
}
```

## MCP

### `GET /v1/mcp/status`

返回 MCP stdio runtime status。

### `GET /v1/mcp/tools`

列出当前可用 MCP tools。

### `POST /v1/mcp/tools/call`

调用 MCP tool。

Request:

```json
{
  "name": "tool-name",
  "arguments": {
    "key": "value"
  }
}
```

也接受 `args` 作为 `arguments` 的别名。

### `GET /v1/mcp/config`

读取 MCP 配置文本。

Response:

```json
{
  "path": ".../mcp.json",
  "text": "{...}"
}
```

### `PUT /v1/mcp/config`

写入 MCP 配置文本。

Request:

```json
{
  "text": "{\"mcpServers\":{}}"
}
```

### `POST /v1/mcp/restart`

应用 MCP 配置并重启 enabled servers。

### `POST /v1/mcp/test`

测试一个 MCP stdio server 配置。

Request:

```json
{
  "name": "filesystem",
  "config": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
    "env": {},
    "cwd": "D:\\Project\\airi",
    "enabled": true
  }
}
```

Response:

```json
{
  "ok": true,
  "tools": ["..."],
  "durationMs": 1000
}
```

## Widgets

### `GET /v1/widgets`

列出当前 widgets。

### `POST /v1/widgets/open`

打开 widgets 窗口。传 `id` 时打开指定 widget。

Request:

```json
{
  "id": "optional-widget-id"
}
```

### `POST /v1/widgets/hide`

隐藏 widgets 窗口。传 `id` 时隐藏指定 widget。

Request:

```json
{
  "id": "optional-widget-id"
}
```

### `POST /v1/widgets`

添加 widget。

Request:

```json
{
  "id": "optional-widget-id",
  "componentName": "WidgetComponentName",
  "componentProps": {
    "title": "Hello"
  },
  "alwaysOnTop": true,
  "size": "m",
  "windowSize": {
    "width": 360,
    "height": 240
  },
  "ttlMs": 30000
}
```

Response:

```json
{
  "id": "widget-id"
}
```

### `PATCH /v1/widgets/{id}`

更新 widget。

Request:

```json
{
  "componentProps": {
    "title": "Updated"
  },
  "alwaysOnTop": false,
  "size": {
    "cols": 2,
    "rows": 1
  },
  "windowSize": {
    "width": 420,
    "height": 260
  },
  "ttlMs": 60000
}
```

### `POST /v1/widgets/{id}/events`

向 widget 发布事件。

Request:

```json
{
  "event": {
    "type": "custom",
    "payload": {
      "value": 1
    }
  }
}
```

如果没有 `event` 字段，整个 body 会作为事件 payload 发布。

### `DELETE /v1/widgets`

清空所有 widgets。

### `DELETE /v1/widgets/{id}`

移除指定 widget。

## Windows

窗口控制统一使用:

```text
POST /v1/windows/{name}/{action}
```

支持的组合:

| name | action | body | 说明 |
| --- | --- | --- | --- |
| `main` | `open` | `{}` | 显示并聚焦主窗口 |
| `main` | `hide` | `{}` | 隐藏主窗口 |
| `main` | `focus` | `{}` | 聚焦主窗口 |
| `chat` | `open` | `{}` | 打开聊天窗口 |
| `settings` | `open` | `{ "route": "/optional-route" }` | 打开设置窗口 |
| `widgets` | `open` | `{ "id": "optional-widget-id" }` | 打开 widgets 窗口 |
| `widgets` | `hide` | `{ "id": "optional-widget-id" }` | 隐藏 widgets 窗口 |
| `spotlight` | `open` | `{}` | 打开 spotlight |

`action` 省略时默认为 `open`, 例如 `POST /v1/windows/main` 等同于 `POST /v1/windows/main/open`。

## Godot Stage

### `GET /v1/stage/godot/status`

返回 Godot sidecar runtime status。

### `POST /v1/stage/godot/start`

启动 Godot sidecar。

### `POST /v1/stage/godot/stop`

停止 Godot sidecar。

### `GET /v1/stage/godot/view`

获取当前 Godot view snapshot。

### `PATCH /v1/stage/godot/view`

修改 Godot camera view state。

Request:

```json
{
  "camera": {
    "position": {
      "x": 0,
      "y": 1.5,
      "z": 3
    },
    "yawDeg": 15,
    "pitchDeg": -5,
    "fovDeg": 45
  }
}
```

Response:

```json
{
  "requestId": "..."
}
```

### `POST /v1/stage/godot/view/request`

请求 Godot 主动发送 view snapshot。

## Plugins

插件控制依赖 plugin host。不可用时返回 `404 PLUGINS_UNAVAILABLE`。

### `GET /v1/plugins`

列出插件。

### `GET /v1/plugins/inspect`

返回 plugin host debug snapshot。

### `GET /v1/plugins/tools`

列出插件暴露的 tools。

### `POST /v1/plugins/load-enabled`

加载所有 enabled plugins。

### `POST /v1/plugins/tools/invoke`

调用插件 tool。

Request:

```json
{
  "ownerExtensionId": "extension-id",
  "name": "tool-name",
  "input": {
    "key": "value"
  }
}
```

### `POST /v1/plugins/{extensionId}/load`

加载指定插件。

### `POST /v1/plugins/{extensionId}/unload`

卸载指定插件。

### `POST /v1/plugins/{extensionId}/enabled`

设置插件 enabled 状态。

Request:

```json
{
  "enabled": true,
  "path": "optional-extension-path"
}
```

`enabled` 省略时默认为 `true`。

### `POST /v1/plugins/{extensionId}/auto-reload`

设置插件 auto reload。

Request:

```json
{
  "enabled": true
}
```

`enabled` 省略时默认为 `true`。

## 完整端点清单

| Method | Path | Auth | 说明 |
| --- | --- | --- | --- |
| `OPTIONS` | `/v1/**` | No | CORS preflight |
| `GET` | `/v1/health` | No | 健康检查 |
| `GET` | `/v1/capabilities` | Yes | 能力列表 |
| `GET` | `/v1/status` | Yes | 总状态快照 |
| `GET` | `/v1/events` | Yes | SSE 事件流 |
| `GET` | `/v1/alive/profile` | Yes | 当前伴侣档案 |
| `GET` | `/v1/alive/state` | Yes | 持久化伴侣状态 |
| `GET` | `/v1/alive/memory` | Yes | 当前 scope 的长期记忆 |
| `POST` | `/v1/alive/reflection` | Yes | 执行伴侣反思 |
| `POST` | `/v1/chat/send` | Yes | 发送聊天消息 |
| `POST` | `/v1/chat/spotlight` | Yes | Spotlight 入口发送 |
| `POST` | `/v1/chat/interrupt` | Yes | 中断排队发送/前台 stream |
| `POST` | `/v1/chat/retry` | Yes | 重试消息 |
| `POST` | `/v1/chat/cleanup` | Yes | 清理会话 |
| `DELETE` | `/v1/chat/messages` | Yes | 删除消息 |
| `GET` | `/v1/chat/sessions` | Yes | 列出会话 |
| `POST` | `/v1/chat/sessions` | Yes | 创建会话 |
| `GET` | `/v1/chat/sessions/{sessionId}/messages` | Yes | 获取指定会话消息 |
| `POST` | `/v1/chat/sessions/{sessionId}/select` | Yes | 选择会话 |
| `GET` | `/v1/chat/messages` | Yes | 获取当前会话消息 |
| `GET` | `/v1/providers` | Yes | Provider 状态 |
| `GET` | `/v1/providers/{kind}/active` | Yes | Active provider |
| `POST` | `/v1/providers/{kind}/active` | Yes | 设置 active provider |
| `GET` | `/v1/providers/models/{providerId}` | Yes | Provider 模型 |
| `POST` | `/v1/speech/synthesize` | Yes | 语音合成 |
| `GET` | `/v1/live2d/expressions` | Yes | Live2D expression 快照 |
| `POST` | `/v1/live2d/expressions/set` | Yes | 设置 expression |
| `POST` | `/v1/live2d/expressions/toggle` | Yes | 切换 expression |
| `POST` | `/v1/live2d/expressions/reset` | Yes | 重置 expression |
| `POST` | `/v1/live2d/expressions/save-defaults` | Yes | 保存 expression 默认值 |
| `POST` | `/v1/live2d/expressions/llm-mode` | Yes | 设置 expression LLM 暴露模式 |
| `POST` | `/v1/live2d/expressions/llm-exposed` | Yes | 设置单个 expression 的 LLM 暴露状态 |
| `GET` | `/v1/mcp/status` | Yes | MCP 状态 |
| `GET` | `/v1/mcp/tools` | Yes | MCP tools |
| `POST` | `/v1/mcp/tools/call` | Yes | 调用 MCP tool |
| `GET` | `/v1/mcp/config` | Yes | 读取 MCP 配置 |
| `PUT` | `/v1/mcp/config` | Yes | 写入 MCP 配置 |
| `POST` | `/v1/mcp/restart` | Yes | 应用并重启 MCP |
| `POST` | `/v1/mcp/test` | Yes | 测试 MCP server |
| `GET` | `/v1/widgets` | Yes | 列出 widgets |
| `POST` | `/v1/widgets/open` | Yes | 打开 widgets 窗口 |
| `POST` | `/v1/widgets/hide` | Yes | 隐藏 widgets 窗口 |
| `POST` | `/v1/widgets` | Yes | 添加 widget |
| `PATCH` | `/v1/widgets/{id}` | Yes | 更新 widget |
| `POST` | `/v1/widgets/{id}/events` | Yes | 发布 widget 事件 |
| `DELETE` | `/v1/widgets` | Yes | 清空 widgets |
| `DELETE` | `/v1/widgets/{id}` | Yes | 删除 widget |
| `POST` | `/v1/windows/{name}/{action}` | Yes | 窗口控制 |
| `GET` | `/v1/stage/godot/status` | Yes | Godot 状态 |
| `POST` | `/v1/stage/godot/start` | Yes | 启动 Godot |
| `POST` | `/v1/stage/godot/stop` | Yes | 停止 Godot |
| `GET` | `/v1/stage/godot/view` | Yes | Godot view snapshot |
| `PATCH` | `/v1/stage/godot/view` | Yes | Godot view patch |
| `POST` | `/v1/stage/godot/view/request` | Yes | 请求 Godot view snapshot |
| `GET` | `/v1/plugins` | Yes | 列出插件 |
| `GET` | `/v1/plugins/inspect` | Yes | Plugin host debug snapshot |
| `GET` | `/v1/plugins/tools` | Yes | 插件 tools |
| `POST` | `/v1/plugins/load-enabled` | Yes | 加载 enabled plugins |
| `POST` | `/v1/plugins/tools/invoke` | Yes | 调用插件 tool |
| `POST` | `/v1/plugins/{extensionId}/load` | Yes | 加载插件 |
| `POST` | `/v1/plugins/{extensionId}/unload` | Yes | 卸载插件 |
| `POST` | `/v1/plugins/{extensionId}/enabled` | Yes | 设置插件 enabled |
| `POST` | `/v1/plugins/{extensionId}/auto-reload` | Yes | 设置插件 auto reload |

## 验证清单

确认 API 正常:

```powershell
Invoke-RestMethod http://127.0.0.1:6122/v1/health
```

确认鉴权和 renderer bridge 正常:

```powershell
$config = Get-Content "$env:APPDATA\@proj-airi\stage-tamagotchi\control-api-config.json" -Raw | ConvertFrom-Json
$headers = @{ Authorization = "Bearer $($config.authToken)" }
Invoke-RestMethod "http://127.0.0.1:$($config.port)/v1/status" -Headers $headers
```

确认聊天链路正常:

```powershell
$body = @{ text = "API 控制测试: 请只回复 API_OK" } | ConvertTo-Json
Invoke-RestMethod "http://127.0.0.1:$($config.port)/v1/chat/send" -Method Post -Headers $headers -ContentType "application/json" -Body $body
Start-Sleep -Seconds 8
Invoke-RestMethod "http://127.0.0.1:$($config.port)/v1/chat/messages" -Headers $headers
```

确认 Live2D expression 控制正常:

```powershell
Invoke-RestMethod "http://127.0.0.1:$($config.port)/v1/live2d/expressions" -Headers $headers
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:$($config.port)/v1/live2d/expressions/toggle" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ name = "Frightened"; duration = 3 } | ConvertTo-Json)
```

确认语音合成 provider 已配置:

```powershell
$status = Invoke-RestMethod "http://127.0.0.1:$($config.port)/v1/status" -Headers $headers
$status.renderer.providers.active.speech
```

## 当前限制

- `/v1/chat/interrupt` 不能强制取消已经发送给模型 provider 的请求。
- `/v1/speech/synthesize` 只合成并返回音频，不直接播放。
- `/v1/live2d/expressions` 依赖主舞台当前 Live2D 模型已加载并解析出 expression。
- SSE 是运行时事件流，不持久化历史事件。
- Widget 和 plugin tool payload 取决于当前应用注册的组件和插件。
- Godot view patch 只接受已定义的 camera 字段。
