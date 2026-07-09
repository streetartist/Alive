import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type {
  DesktopControlMouseButton,
  ElectronDesktopControlAction,
  ElectronDesktopControlResult,
  ElectronDesktopSnapshot,
} from '../../../shared/eventa'

import process from 'node:process'

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { defineInvokeHandler } from '@moeru/eventa'
import { screen } from 'electron'
import { isWindows } from 'std-env'

import { electronDesktopGetSnapshot, electronDesktopRunAction } from '../../../shared/eventa'

type EventaMainContext = ReturnType<typeof createContext>['context']

const execFileAsync = promisify(execFile)
const MAX_TEXT_LENGTH = 2000
const MAX_DRAG_DURATION_MS = 5000
const MAX_CLICK_COUNT = 3
const MAX_SCROLL_DELTA = 6000
const SUPPORTED_BUTTONS = new Set<DesktopControlMouseButton>(['left', 'middle', 'right'])
const SUPPORTED_HOTKEY_PARTS = new Set([
  'alt',
  'backspace',
  'ctrl',
  'control',
  'delete',
  'down',
  'end',
  'enter',
  'escape',
  'esc',
  'home',
  'left',
  'pagedown',
  'pageup',
  'right',
  'shift',
  'space',
  'tab',
  'up',
])

for (let index = 1; index <= 12; index += 1)
  SUPPORTED_HOTKEY_PARTS.add(`f${index}`)
for (let index = 0; index <= 9; index += 1)
  SUPPORTED_HOTKEY_PARTS.add(`${index}`)
for (let charCode = 97; charCode <= 122; charCode += 1)
  SUPPORTED_HOTKEY_PARTS.add(String.fromCharCode(charCode))

function assertFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`${field} must be a finite number`)
  return value
}

function assertIntegerInRange(value: unknown, field: string, min: number, max: number): number {
  const number = assertFiniteNumber(value, field)
  if (!Number.isInteger(number) || number < min || number > max)
    throw new TypeError(`${field} must be an integer between ${min} and ${max}`)
  return number
}

function assertButton(value: unknown): DesktopControlMouseButton {
  if (typeof value !== 'string' || !SUPPORTED_BUTTONS.has(value as DesktopControlMouseButton))
    throw new TypeError('button must be one of: left, middle, right')
  return value as DesktopControlMouseButton
}

function normalizeHotkeyPart(value: unknown): string {
  if (typeof value !== 'string')
    throw new TypeError('hotkey entries must be strings')

  const normalized = value.trim().toLowerCase().replace(/^control_[lr]$/, 'control').replace(/^ctrl_[lr]$/, 'ctrl').replace(/^alt_[lr]$/, 'alt').replace(/^shift_[lr]$/, 'shift').replace(/^arrow/, '')

  if (!SUPPORTED_HOTKEY_PARTS.has(normalized)) {
    throw new TypeError(
      `Unsupported hotkey part "${value}". Use letters, digits, F1-F12, Ctrl, Alt, Shift, arrows, Enter, Tab, Escape, Backspace, Delete, Home, End, PageUp, PageDown, or Space.`,
    )
  }

  return normalized
}

function normalizeAction(payload: ElectronDesktopControlAction): ElectronDesktopControlAction {
  if (!payload || typeof payload !== 'object')
    throw new TypeError('desktop action payload must be an object')

  switch (payload.action) {
    case 'move':
      return {
        action: 'move',
        x: assertFiniteNumber(payload.x, 'x'),
        y: assertFiniteNumber(payload.y, 'y'),
      }
    case 'click':
      return {
        action: 'click',
        x: assertFiniteNumber(payload.x, 'x'),
        y: assertFiniteNumber(payload.y, 'y'),
        button: assertButton(payload.button),
        clickCount: assertIntegerInRange(payload.clickCount, 'clickCount', 1, MAX_CLICK_COUNT),
      }
    case 'drag':
      return {
        action: 'drag',
        fromX: assertFiniteNumber(payload.fromX, 'fromX'),
        fromY: assertFiniteNumber(payload.fromY, 'fromY'),
        toX: assertFiniteNumber(payload.toX, 'toX'),
        toY: assertFiniteNumber(payload.toY, 'toY'),
        button: assertButton(payload.button),
        durationMs: assertIntegerInRange(payload.durationMs, 'durationMs', 0, MAX_DRAG_DURATION_MS),
      }
    case 'scroll':
      return {
        action: 'scroll',
        x: assertFiniteNumber(payload.x, 'x'),
        y: assertFiniteNumber(payload.y, 'y'),
        deltaX: assertIntegerInRange(payload.deltaX, 'deltaX', -MAX_SCROLL_DELTA, MAX_SCROLL_DELTA),
        deltaY: assertIntegerInRange(payload.deltaY, 'deltaY', -MAX_SCROLL_DELTA, MAX_SCROLL_DELTA),
      }
    case 'typeText': {
      if (typeof payload.text !== 'string')
        throw new TypeError('text must be a string')
      if (payload.text.length > MAX_TEXT_LENGTH)
        throw new TypeError(`text must be at most ${MAX_TEXT_LENGTH} characters`)
      return {
        action: 'typeText',
        text: payload.text,
      }
    }
    case 'hotkey': {
      if (!Array.isArray(payload.keys) || payload.keys.length < 1 || payload.keys.length > 4)
        throw new TypeError('keys must contain 1 to 4 entries')
      return {
        action: 'hotkey',
        keys: payload.keys.map(normalizeHotkeyPart),
      }
    }
    default:
      throw new TypeError(`Unsupported desktop action: ${(payload as { action?: unknown }).action ?? '<missing>'}`)
  }
}

function createSnapshot(): ElectronDesktopSnapshot {
  const cursor = screen.getCursorScreenPoint()

  return {
    platform: process.platform,
    cursor,
    displays: screen.getAllDisplays().map(display => ({
      id: display.id,
      scaleFactor: display.scaleFactor,
      bounds: display.bounds,
      workArea: display.workArea,
    })),
  }
}

function encodePowerShellCommand(command: string): string {
  return Buffer.from(command, 'utf16le').toString('base64')
}

function buildWindowsInputScript(action: ElectronDesktopControlAction): string {
  const payloadBase64 = Buffer.from(JSON.stringify(action), 'utf8').toString('base64')

  return `
$ErrorActionPreference = 'Stop'
$payloadJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${payloadBase64}'))
$payload = $payloadJson | ConvertFrom-Json
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class AiriDesktopInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct INPUT {
    public int type;
    public InputUnion U;
  }

  [StructLayout(LayoutKind.Explicit)]
  struct InputUnion {
    [FieldOffset(0)]
    public MOUSEINPUT mi;
    [FieldOffset(0)]
    public KEYBDINPUT ki;
    [FieldOffset(0)]
    public HARDWAREINPUT hi;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct MOUSEINPUT {
    public int dx;
    public int dy;
    public int mouseData;
    public int dwFlags;
    public int time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public int dwFlags;
    public int time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct HARDWAREINPUT {
    public int uMsg;
    public short wParamL;
    public short wParamH;
  }

  [DllImport("user32.dll")]
  static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  static extern bool GetCursorPos(out POINT lpPoint);

  [DllImport("user32.dll", SetLastError = true)]
  static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

  const int INPUT_MOUSE = 0;
  const int INPUT_KEYBOARD = 1;
  const int MOUSEEVENTF_LEFTDOWN = 0x0002;
  const int MOUSEEVENTF_LEFTUP = 0x0004;
  const int MOUSEEVENTF_RIGHTDOWN = 0x0008;
  const int MOUSEEVENTF_RIGHTUP = 0x0010;
  const int MOUSEEVENTF_MIDDLEDOWN = 0x0020;
  const int MOUSEEVENTF_MIDDLEUP = 0x0040;
  const int MOUSEEVENTF_WHEEL = 0x0800;
  const int MOUSEEVENTF_HWHEEL = 0x01000;
  const int KEYEVENTF_KEYUP = 0x0002;
  const int KEYEVENTF_UNICODE = 0x0004;

  static void SendMouseFlag(int flag) {
    INPUT input = new INPUT();
    input.type = INPUT_MOUSE;
    input.U.mi.dwFlags = flag;
    uint sent = SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
    if (sent != 1) {
      throw new InvalidOperationException("SendInput mouse event failed.");
    }
  }

  static int MouseDownFlag(string button) {
    switch ((button ?? "").ToLowerInvariant()) {
      case "left": return MOUSEEVENTF_LEFTDOWN;
      case "middle": return MOUSEEVENTF_MIDDLEDOWN;
      case "right": return MOUSEEVENTF_RIGHTDOWN;
      default: throw new ArgumentException("Unsupported mouse button: " + button);
    }
  }

  static int MouseUpFlag(string button) {
    switch ((button ?? "").ToLowerInvariant()) {
      case "left": return MOUSEEVENTF_LEFTUP;
      case "middle": return MOUSEEVENTF_MIDDLEUP;
      case "right": return MOUSEEVENTF_RIGHTUP;
      default: throw new ArgumentException("Unsupported mouse button: " + button);
    }
  }

  public static void Click(int x, int y, string button, int clickCount) {
    SetCursorPos(x, y);
    for (int index = 0; index < clickCount; index += 1) {
      SendMouseFlag(MouseDownFlag(button));
      SendMouseFlag(MouseUpFlag(button));
      Thread.Sleep(60);
    }
  }

  public static void Move(int x, int y) {
    SetCursorPos(x, y);
  }

  static void SendWheel(int flag, int amount) {
    if (amount == 0) {
      return;
    }
    INPUT input = new INPUT();
    input.type = INPUT_MOUSE;
    input.U.mi.mouseData = amount;
    input.U.mi.dwFlags = flag;
    uint sent = SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
    if (sent != 1) {
      throw new InvalidOperationException("SendInput wheel event failed.");
    }
  }

  public static void Scroll(int x, int y, int deltaX, int deltaY) {
    SetCursorPos(x, y);
    // The tool API follows web-style deltas: positive Y means scrolling down.
    // Win32 wheel data is positive for wheel-up, so vertical input is inverted here.
    SendWheel(MOUSEEVENTF_WHEEL, -deltaY);
    SendWheel(MOUSEEVENTF_HWHEEL, deltaX);
  }

  public static void Drag(int fromX, int fromY, int toX, int toY, string button, int durationMs) {
    int steps = Math.Max(1, Math.Min(120, durationMs <= 0 ? 1 : durationMs / 16));
    int delay = steps <= 0 ? 0 : Math.Max(1, durationMs / steps);

    SetCursorPos(fromX, fromY);
    SendMouseFlag(MouseDownFlag(button));
    for (int step = 1; step <= steps; step += 1) {
      int x = fromX + ((toX - fromX) * step / steps);
      int y = fromY + ((toY - fromY) * step / steps);
      SetCursorPos(x, y);
      if (durationMs > 0) {
        Thread.Sleep(delay);
      }
    }
    SendMouseFlag(MouseUpFlag(button));
  }

  static ushort Vk(string key) {
    string normalized = (key ?? "").ToLowerInvariant();
    if (normalized.Length == 1) {
      char ch = normalized[0];
      if (ch >= 'a' && ch <= 'z') return (ushort)Char.ToUpperInvariant(ch);
      if (ch >= '0' && ch <= '9') return (ushort)ch;
    }
    if (normalized.Length > 1 && normalized[0] == 'f') {
      int number;
      if (Int32.TryParse(normalized.Substring(1), out number) && number >= 1 && number <= 12) {
        return (ushort)(0x70 + number - 1);
      }
    }
    switch (normalized) {
      case "ctrl":
      case "control": return 0x11;
      case "shift": return 0x10;
      case "alt": return 0x12;
      case "enter": return 0x0D;
      case "tab": return 0x09;
      case "escape":
      case "esc": return 0x1B;
      case "space": return 0x20;
      case "backspace": return 0x08;
      case "delete": return 0x2E;
      case "left": return 0x25;
      case "up": return 0x26;
      case "right": return 0x27;
      case "down": return 0x28;
      case "home": return 0x24;
      case "end": return 0x23;
      case "pageup": return 0x21;
      case "pagedown": return 0x22;
      default: throw new ArgumentException("Unsupported key: " + key);
    }
  }

  static void SendKey(ushort vk, bool keyUp) {
    INPUT input = new INPUT();
    input.type = INPUT_KEYBOARD;
    input.U.ki.wVk = vk;
    input.U.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
    uint sent = SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
    if (sent != 1) {
      throw new InvalidOperationException("SendInput key event failed.");
    }
  }

  public static void Hotkey(string[] keys) {
    ushort[] mapped = new ushort[keys.Length];
    for (int index = 0; index < keys.Length; index += 1) {
      mapped[index] = Vk(keys[index]);
    }
    for (int index = 0; index < mapped.Length; index += 1) {
      SendKey(mapped[index], false);
    }
    for (int index = mapped.Length - 1; index >= 0; index -= 1) {
      SendKey(mapped[index], true);
    }
  }

  public static void TypeText(string text) {
    foreach (char ch in text ?? "") {
      INPUT down = new INPUT();
      down.type = INPUT_KEYBOARD;
      down.U.ki.wScan = ch;
      down.U.ki.dwFlags = KEYEVENTF_UNICODE;

      INPUT up = new INPUT();
      up.type = INPUT_KEYBOARD;
      up.U.ki.wScan = ch;
      up.U.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

      uint sent = SendInput(2, new INPUT[] { down, up }, Marshal.SizeOf(typeof(INPUT)));
      if (sent != 2) {
        throw new InvalidOperationException("SendInput text event failed.");
      }
    }
  }
}
"@

switch ([string]$payload.action) {
  'move' {
    [AiriDesktopInput]::Move([int]$payload.x, [int]$payload.y)
  }
  'click' {
    [AiriDesktopInput]::Click([int]$payload.x, [int]$payload.y, [string]$payload.button, [int]$payload.clickCount)
  }
  'drag' {
    [AiriDesktopInput]::Drag([int]$payload.fromX, [int]$payload.fromY, [int]$payload.toX, [int]$payload.toY, [string]$payload.button, [int]$payload.durationMs)
  }
  'scroll' {
    [AiriDesktopInput]::Scroll([int]$payload.x, [int]$payload.y, [int]$payload.deltaX, [int]$payload.deltaY)
  }
  'typeText' {
    [AiriDesktopInput]::TypeText([string]$payload.text)
  }
  'hotkey' {
    [AiriDesktopInput]::Hotkey([string[]]$payload.keys)
  }
  default {
    throw "Unsupported action: $($payload.action)"
  }
}
`
}

async function runWindowsInputAction(action: ElectronDesktopControlAction): Promise<void> {
  if (!isWindows) {
    throw new Error(`Desktop input control is currently implemented only on Windows. Current platform: ${process.platform}`)
  }

  const script = buildWindowsInputScript(action)
  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    encodePowerShellCommand(script),
  ], {
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  })
}

async function runAction(payload: ElectronDesktopControlAction): Promise<ElectronDesktopControlResult> {
  const action = normalizeAction(payload)
  await runWindowsInputAction(action)
  const cursor = screen.getCursorScreenPoint()

  return {
    action: action.action,
    cursor,
    message: `Desktop action completed: ${action.action}`,
  }
}

export function createDesktopControlService(params: { context: EventaMainContext }) {
  defineInvokeHandler(params.context, electronDesktopGetSnapshot, () => createSnapshot())
  defineInvokeHandler(params.context, electronDesktopRunAction, payload => runAction(payload))
}
