---
title: Stage Tamagotchi Windows Unpacked EXE Build
date: 2026-07-09
category: developer-experience
module: apps/stage-tamagotchi
problem_type: packaging
component: electron-builder
severity: high
applies_when:
  - "Need to send a runnable Windows exe without building an installer"
  - "Electron app starts from source but clean extracted win-unpacked fails"
  - "Packaged app shows A JavaScript error occurred in the main process"
  - "Packaged app reports ERR_MODULE_NOT_FOUND for semver, @proj-airi/i18n, or other runtime packages"
tags:
  - electron
  - electron-builder
  - pnpm
  - windows
  - win-unpacked
  - stage-tamagotchi
---

# Stage Tamagotchi Windows Unpacked EXE Build

## 目标

这份文档描述如何为 `apps/stage-tamagotchi` 生成一个“不做安装包，但解压后可以直接运行的 Windows exe”。

正确产物不是 `out/`，也不是单纯的 JS 编译结果。正确产物是 Electron 打包后的目录：

```text
apps/stage-tamagotchi/dist/win-unpacked/airi.exe
```

发给别人时压缩整个 `win-unpacked` 目录，例如：

```text
stage-tamagotchi-win-unpacked-runnable-YYYYMMDD-HHmm.zip
```

## 这次踩坑的根因

这次先生成过几个不可用产物：

- `stage-tamagotchi-win-unpacked-runnable-20260709-2119.zip`
- `stage-tamagotchi-win-unpacked-runnable-20260709-2146.zip`

它们的问题不是 exe 本体不存在，而是解压运行后 Electron 主进程缺运行时依赖：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'semver'
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@proj-airi/i18n'
```

根因有两个：

1. 手搓了一个最小 Electron 打包目录，只复制了少数 `node_modules`，但 `out/main/index.js` 仍然会 import 大量运行时依赖和 workspace 包。
2. 官方 `electron-builder --dir --win` 才是正确入口，但当前 pnpm workspace + nolyfill alias/override 会触发 electron-builder 的 pnpm dependency collector 问题，导致它在收集生产依赖时误报缺包。

所以正确判断标准不能是“exe 能启动一个进程”，而必须是“从 zip 干净解压后运行，没有主进程 JS 错误弹窗，且能看到正常 AIRI 窗口”。

## 正确流程

### 1. 使用仓库指定 pnpm 版本

仓库 `packageManager` 是 `pnpm@10.33.0`。不要让全局 pnpm 11 直接改 lockfile。

推荐命令：

```powershell
npm exec pnpm@10.33.0 -- --version
```

如果需要安装依赖，优先保持 lockfile 不变：

```powershell
npm exec pnpm@10.33.0 -- install --frozen-lockfile
```

如果本地依赖已经被历史操作弄乱，先确认不要提交 `pnpm-lock.yaml` 的无关变化。

### 2. 先构建 Electron app 输出

```powershell
npm exec pnpm@10.33.0 -- -F @proj-airi/stage-tamagotchi build
```

这一步只生成 Electron/Vite 编译输出，主要是：

```text
apps/stage-tamagotchi/out/main/index.js
apps/stage-tamagotchi/out/preload
apps/stage-tamagotchi/out/renderer
```

注意：`out/` 不能直接发给别人，它不是可运行桌面 app。

### 3. 用官方 electron-builder 生成 win-unpacked

进入 app 目录运行官方 builder：

```powershell
cd C:\Users\flash\Documents\alive、\apps\stage-tamagotchi
& 'C:\Users\flash\Documents\alive、\node_modules\.pnpm\node_modules\.bin\electron-builder.CMD' --dir --win
```

正常目标输出：

```text
apps/stage-tamagotchi/dist/win-unpacked/airi.exe
```

`--dir --win` 的含义是：

- `--win`：构建 Windows Electron app；
- `--dir`：只生成 unpacked 目录，不生成 NSIS 安装包。

### 4. 如果 electron-builder 卡在 pnpm 依赖收集

这次遇到的是 electron-builder 的 pnpm dependency collector 对 alias/override 识别不稳。典型错误：

```text
Production dependency onnxruntime-web not found for package @huggingface/transformers
Production dependency side-channel not found for package qs
Production dependency safe-buffer not found for package readable-stream
Production dependency safer-buffer not found for package iconv-lite
```

本地应急处理是修正 `node_modules/.pnpm/.../package.json` 的元数据，让 electron-builder 的静态依赖检查能继续走完。注意：这是本地打包环境修复，不要提交 `node_modules`。

本次实际修过的方向：

```text
@huggingface/transformers package.json:
  onnxruntime-web -> 1.24.3

@nolyfill/side-channel package.json:
  name -> side-channel
  version -> 1.1.0

@nolyfill/safe-buffer package.json:
  name -> safe-buffer
  version -> 5.2.1

@nolyfill/safer-buffer package.json:
  name -> safer-buffer
  version -> 2.1.2

readable-stream / string_decoder package.json:
  safe-buffer range -> >=5.1.0 <6
```

如果同类错误继续出现，处理原则是：

1. 先读报错里的 `parent`、`dependency`、`version`。
2. 在 `node_modules/.pnpm` 里找实际安装的包。
3. 如果是 pnpm alias/override 导致包名不一致，修正本地包 metadata。
4. 如果是同一个实现被多个小版本 range 卡住，优先放宽 parent 的本地 dependency range。
5. 重新跑 `electron-builder --dir --win`。

不要用“手工复制少数 node_modules”的方式绕过。那会从一个缺包变成下一个缺包，最终产物不可控。

## 压缩产物

builder 成功后，压缩整个 `win-unpacked` 目录：

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$zip = "C:\Users\flash\Documents\alive、\stage-tamagotchi-win-unpacked-runnable-$stamp.zip"
$source = 'C:\Users\flash\Documents\alive、\apps\stage-tamagotchi\dist\win-unpacked'
Compress-Archive -LiteralPath $source -DestinationPath $zip -CompressionLevel Optimal
Get-Item -LiteralPath $zip | Select-Object FullName,Length,LastWriteTime
```

这会让 zip 根目录里包含 `win-unpacked/`。接收方解压后运行：

```text
win-unpacked/airi.exe
```

## 必须做的干净解压验证

不要只在 `apps/stage-tamagotchi/dist/win-unpacked` 原目录里运行。必须从 zip 解压到临时目录验证。

```powershell
$zip = 'C:\Users\flash\Documents\alive、\stage-tamagotchi-win-unpacked-runnable-20260709-2232.zip'
$verifyRoot = Join-Path $env:TEMP 'airi-unpacked-verify-20260709-2232'

if (Test-Path -LiteralPath $verifyRoot) {
  Remove-Item -LiteralPath $verifyRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $verifyRoot | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $verifyRoot

$exe = Join-Path $verifyRoot 'win-unpacked\airi.exe'
Get-Process -Name airi -ErrorAction SilentlyContinue | Stop-Process -Force
$p = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds 20
Get-Process -Id $p.Id -ErrorAction SilentlyContinue
```

通过标准：

- `airi.exe` 进程仍在；
- 能看到 `AIRI` / `Welcome to AIRI` 窗口；
- 没有 Electron 弹窗：`A JavaScript error occurred in the main process`；
- 没有 `ERR_MODULE_NOT_FOUND`；
- 没有 `Cannot find package ...`。

如果只看到进程但有错误弹窗，不算通过。

## 捕获 Electron 主进程错误弹窗

可以用 UIAutomation 抓窗口文字：

```powershell
Add-Type -AssemblyName UIAutomationClient
$root = [System.Windows.Automation.AutomationElement]::RootElement
$condPid = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
  $p.Id
)
$wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $condPid)

for ($i = 0; $i -lt $wins.Count; $i++) {
  $w = $wins.Item($i)
  $all = $w.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )

  for ($j = 0; $j -lt $all.Count; $j++) {
    $name = $all.Item($j).Current.Name
    if ($name -match 'JavaScript error|ERR_MODULE_NOT_FOUND|Cannot find package|Cannot find module|Error') {
      $name
    }
  }
}
```

这比只看进程是否存活可靠。

## 本次验证通过的产物

本次最终通过的产物：

```text
C:\Users\flash\Documents\alive、\stage-tamagotchi-win-unpacked-runnable-20260709-2232.zip
```

验证结果：

- 从 zip 解压到：

```text
C:\Users\flash\AppData\Local\Temp\airi-unpacked-verify-20260709-2232
```

- 运行：

```text
win-unpacked\airi.exe
```

- 进程保持运行；
- 窗口显示 `Welcome to AIRI / 欢迎来到 AIRI！`；
- 没有主进程 JS 错误；
- 没有缺包错误。

## 不要再做的事

不要把下面这些当成可交付 exe：

- `apps/stage-tamagotchi/out`
- 单独的 `airi.exe`
- 手搓 `.electron-dir-project` 但只复制几个依赖
- 只验证 `dist/win-unpacked/airi.exe` 原地能跑
- 没有经过 clean unzip validation 的 zip

不要把坏包继续转发：

```text
stage-tamagotchi-win-unpacked-runnable-20260709-2119.zip
stage-tamagotchi-win-unpacked-runnable-20260709-2146.zip
```

## 后续工程化建议

当前应急方案能产出可运行 exe，但 metadata patch 发生在本地 `node_modules`，不适合长期依赖。

更稳的长期方向有两个：

1. 给 `apps/stage-tamagotchi` 增加一个专用 `build:win-unpacked-runnable` 脚本，自动执行 build、electron-builder、zip、clean unzip validation。
2. 研究并落地 `pnpm deploy` 或 electron-builder pnpm collector patch，让打包输入变成隔离的、可移植的生产 `node_modules`，避免每次人工修 alias metadata。

在这两个工程化改造完成前，发包必须保留最后的干净解压运行验证。
