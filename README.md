# Alive

## 中文

Alive 是一个本地桌面 AI 角色项目，用于把虚拟角色、聊天、语音、窗口小部件和本地控制 API 组合成一个可直接运行的桌面伴侣。

本项目是 [Project AIRI](https://github.com/moeru-ai/airi) 的衍生项目，基于 AIRI 的代码与架构继续调整和扩展。Alive 会保留对上游项目的署名与许可证要求，但 README 中只描述本项目当前目标和使用方式。

### 当前目标

- 提供可运行的 Electron 桌面角色。
- 支持通过本地 Web API 控制 AI 能力。
- 支持文本聊天、语音输入、语音合成和角色旁聊天气泡显示。
- 保持本地监听优先，避免默认暴露到公网。
- 在 AIRI 基础上逐步收敛成 Alive 自己的产品形态。

### 开发

```sh
pnpm install
pnpm -F @proj-airi/stage-tamagotchi start
```

### 构建桌面版

```sh
pnpm -F @proj-airi/stage-tamagotchi build
```

### API 文档

本地控制 API 文档见：

```text
docs/ai/context/stage-tamagotchi-control-api.md
```

### 衍生关系

Alive 基于 Project AIRI 衍生开发。Project AIRI 的原始版权、许可证和贡献归属仍属于其对应作者与贡献者。Alive 的新增功能、配置和文档会在此基础上继续独立演进。

---

## English

Alive is a local desktop AI character project. It combines a virtual character, chat, speech, widgets, and a local control API into a runnable desktop companion.

This project is a derivative of [Project AIRI](https://github.com/moeru-ai/airi). Alive continues from AIRI's codebase and architecture while adapting the product direction for this project. Attribution and license requirements for the upstream project are preserved, but this README only describes Alive-specific goals and usage.

### Current Goals

- Provide a runnable Electron desktop character.
- Expose AI controls through a local Web API.
- Support text chat, voice input, speech synthesis, and chat bubbles beside the character.
- Prefer local-only listening by default and avoid public network exposure.
- Gradually shape the AIRI foundation into Alive's own product experience.

### Development

```sh
pnpm install
pnpm -F @proj-airi/stage-tamagotchi start
```

### Build Desktop App

```sh
pnpm -F @proj-airi/stage-tamagotchi build
```

### API Documentation

Local control API documentation is available at:

```text
docs/ai/context/stage-tamagotchi-control-api.md
```

### Derivative Notice

Alive is derived from Project AIRI. The original copyright, license, and contributor attribution of Project AIRI remain with their respective authors and contributors. Alive-specific features, configuration, and documentation will continue to evolve independently on top of that foundation.
