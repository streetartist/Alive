---
title: Stage Tamagotchi Windows 一键打包与桌面控制特效
date: 2026-07-11
category: developer-experience
module: apps/stage-tamagotchi
problem_type: packaging
component: electron-builder
severity: high
tags:
  - electron
  - electron-builder
  - pnpm
  - windows
  - desktop-control
  - win-unpacked
---

# Stage Tamagotchi Windows 一键打包与桌面控制特效

## 功能概述

仓库现在提供 Windows 一键打包入口：

```text
apps/stage-tamagotchi/package-win-runnable.cmd
```

双击该文件会依次完成：

1. 检查 Node.js、npm、pnpm 和 workspace 依赖。
2. 构建 `@proj-airi/desktop-control` 与 `@proj-airi/pipelines-audio`。
3. 编译 Stage Tamagotchi Electron 主进程、preload 和 renderer。
4. 创建隔离的 Electron 打包项目并安装明确的运行时依赖。
5. 使用 electron-builder 生成 `win-unpacked`。
6. 创建可直接解压运行的 ZIP。
7. 从 ZIP 解压到全新的临时目录并启动验证。
8. 验证成功后替换旧的 verified ZIP，并启动验证通过的应用。

也可以从工作区根目录运行：

```powershell
pnpm -F @proj-airi/stage-tamagotchi package:win:runnable
```

PowerShell 脚本支持以下参数：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File apps/stage-tamagotchi/scripts/package-win-runnable.ps1 `
  -OutputName stage-tamagotchi-win-unpacked-runnable-verified.zip `
  -SkipBuild `
  -SkipLaunchVerification `
  -LaunchAfterVerification `
  -KeepWorkDirectories
```

`-SkipBuild` 只应在当前 `out/` 已由相同源码成功构建时使用。失败时脚本会保留暂存、打包输出和验证目录，便于检查；成功时默认清理这些中间目录。

## 为什么源码编译成功但 ZIP 无法运行

pnpm workspace 中存在完整依赖并不代表 electron-builder 会把所有运行时包放进 `app.asar`。

本次遇到的依赖链包括：

```text
@nut-tree-fork/nut-js
  -> jimp
    -> @jimp/custom
```

以及 Electron 主进程仍然外置的 workspace 包：

```text
@proj-airi/i18n
```

因此会出现：

```text
编译环境：依赖存在，构建成功
打包环境：依赖收集遗漏，启动时报 ERR_MODULE_NOT_FOUND
```

项目级修复包含两部分：

- 将 `@jimp/custom` 声明为 Stage Tamagotchi 的明确运行时依赖。
- 主进程默认打包纯 JavaScript/TypeScript 依赖，只外置必须保留真实文件结构的原生模块；隔离打包项目再安装这些外置依赖和 `@proj-airi/i18n` 的已构建产物。

不要通过手工向某个 ZIP 或 `app.asar` 复制单个包来修复。该做法只能修复当前产物，下次构建仍会复现。

## 验证标准

验证不能只检查 `airi.exe` 的父进程是否存活。Electron 显示主进程错误窗口时，进程仍可能暂时存在；单实例应用也可能让启动进程正常退出并将请求转交给旧实例。

脚本使用独立的 `--user-data-dir`，并检查主进程 stderr。以下内容均视为失败：

```text
ERR_MODULE_NOT_FOUND
Uncaught Exception
A JavaScript error occurred
```

ZIP 采用临时文件生成。只有干净解压验证通过后，脚本才会原子替换：

```text
stage-tamagotchi-win-unpacked-runnable-verified.zip
```

因此一次失败的构建不会覆盖上一个已验证产物。

## 蓝色桌面鼠标特效

桌面控制成功执行鼠标操作后，Electron 主进程会创建一个小型透明覆盖窗口，并在全局桌面坐标处显示 Codex 风格的蓝色鼠标反馈：

- 移动：蓝色光晕呼吸。
- 点击：蓝色圆环扩散。
- 滚动：蓝色涟漪。
- 拖拽：在终点显示更强的蓝色脉冲。

覆盖窗口具有以下约束：

- 点击穿透，不接收任何鼠标输入。
- 不获取焦点，不改变当前前台应用。
- 不显示在任务栏。
- 仅在桌面操作成功后显示。
- 动画结束后自动隐藏，应用退出时销毁。
- 遵循系统的 `prefers-reduced-motion` 设置。

实现位置：

```text
apps/stage-tamagotchi/src/main/services/electron/desktop-control-effect.ts
apps/stage-tamagotchi/src/main/services/electron/desktop-control.ts
```

## 不应提交的本地产物

以下文件用于本地验证或故障诊断，不应提交到 Git：

```text
.npmrc
node_modules.broken-*
apps/stage-tamagotchi/.electron-runnable-project/
apps/stage-tamagotchi/dist-runnable-*/
stage-tamagotchi-compiled-out-*.zip
stage-tamagotchi-win-unpacked-runnable-*.zip
```

尤其不要重新分发已经验证失败的日期命名 ZIP。
