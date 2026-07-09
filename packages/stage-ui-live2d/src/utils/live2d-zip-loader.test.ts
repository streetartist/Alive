import JSZip from 'jszip'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function blobFromBytes(data: Uint8Array): Blob {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return new Blob([buffer])
}

function fileWithRelativePath(content: Blob | string | Uint8Array, name: string, webkitRelativePath: string): File {
  const fileContent = content instanceof Uint8Array ? blobFromBytes(content) : content
  const file = new File([fileContent], name)
  Object.defineProperty(file, 'webkitRelativePath', {
    value: webkitRelativePath,
  })
  return file
}

class TestFileReader {
  result: string | null = null
  onload: (() => void) | null = null
  onerror: ((error: unknown) => void) | null = null

  readAsText(file: File): void {
    void file.text()
      .then((text) => {
        this.result = text
        this.onload?.()
      })
      .catch(error => this.onerror?.(error))
  }
}

function createShisihangshiSettingsText(): string {
  return JSON.stringify({
    Version: 3,
    FileReferences: {
      Moc: '302301_shisihangshi.moc3',
      Textures: ['textures/302301_shisihangshi_00.png'],
      Physics: null,
      Motions: {
        '': [{ File: 'motions/t_idle.motion3.json' }],
      },
    },
    Groups: [],
  })
}

function createYouxiaomiaoSettingsText(): string {
  return JSON.stringify({
    Version: 3,
    FileReferences: {
      Moc: '悠小喵.moc3',
      Textures: ['悠小喵.8192/texture_00.png'],
      Physics: '悠小喵.physics3.json',
      DisplayInfo: '悠小喵.cdi3.json',
      Motions: {
        '': [{ File: 'exp/常规.motion3.json' }],
      },
    },
    Groups: [],
  })
}

function createExpressionText(parameterId = 'ParamHappy'): string {
  return JSON.stringify({
    Type: 'Live2D Expression',
    Parameters: [
      { Id: parameterId, Value: 1, Blend: 'Add' },
    ],
  })
}

interface TestExpressionMetadataFile {
  name: string
  fileName: string
  data: Record<string, unknown>
}

interface TestExpressionMetadataSettings {
  _expFiles?: TestExpressionMetadataFile[]
}

function expressionMetadata(settings: unknown): TestExpressionMetadataFile[] {
  return (settings as TestExpressionMetadataSettings)._expFiles ?? []
}

const appleDoubleHeader = new Uint8Array([0, 5, 22, 7, 0, 2, 0, 0, 77, 97, 99, 32, 79, 83, 32, 88])

describe('live2d zip loader settings sanitization', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { Live2DCubismCore: {} })
    vi.stubGlobal('FileReader', TestFileReader)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads a zip model when model3.json contains Physics: null', async () => {
    await import('./live2d-zip-loader')
    const { ZipLoader } = await import('pixi-live2d-display/cubism4')

    const zip = new JSZip()
    zip.file('302301_shisihangshi/302301_shisihangshi.model3.json', createShisihangshiSettingsText())
    zip.file('302301_shisihangshi/302301_shisihangshi.moc3', new Uint8Array([77, 79, 67, 51]))
    zip.file('302301_shisihangshi/textures/302301_shisihangshi_00.png', new Uint8Array([1, 2, 3]))
    zip.file('302301_shisihangshi/motions/t_idle.motion3.json', '{}')

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())
    const settings = await ZipLoader.createSettings(reader)
    const files = await ZipLoader.unzip(reader, settings)

    expect(settings.physics).toBeUndefined()
    expect(files.map(file => file.webkitRelativePath).sort()).toEqual([
      '302301_shisihangshi/302301_shisihangshi.moc3',
      '302301_shisihangshi/motions/t_idle.motion3.json',
      '302301_shisihangshi/textures/302301_shisihangshi_00.png',
    ])
  })

  it('loads a zip model when a macOS AppleDouble settings sidecar is present before the real settings file', async () => {
    await import('./live2d-zip-loader')
    const { ZipLoader } = await import('pixi-live2d-display/cubism4')

    const zip = new JSZip()
    zip.file('__MACOSX/302301_shisihangshi/._302301_shisihangshi.model3.json', appleDoubleHeader)
    zip.file('302301_shisihangshi/302301_shisihangshi.model3.json', createShisihangshiSettingsText())
    zip.file('302301_shisihangshi/302301_shisihangshi.moc3', new Uint8Array([77, 79, 67, 51]))
    zip.file('302301_shisihangshi/textures/302301_shisihangshi_00.png', new Uint8Array([1, 2, 3]))
    zip.file('302301_shisihangshi/motions/t_idle.motion3.json', '{}')

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())
    const settings = await ZipLoader.createSettings(reader)
    const filePaths = await ZipLoader.getFilePaths(reader)

    expect(settings.url).toBe('302301_shisihangshi/302301_shisihangshi.model3.json')
    expect(settings.physics).toBeUndefined()
    expect(filePaths).not.toContain('__MACOSX/302301_shisihangshi/._302301_shisihangshi.model3.json')
  })

  it('extracts undeclared exp3 files from zip models for expression auto-discovery', async () => {
    await import('./live2d-zip-loader')
    const { ZipLoader } = await import('pixi-live2d-display/cubism4')

    const zip = new JSZip()
    zip.file('IceGirl/IceGirl.model3.json', createShisihangshiSettingsText())
    zip.file('IceGirl/IceGirl.moc3', new Uint8Array([77, 79, 67, 51]))
    zip.file('IceGirl/textures/texture_00.png', new Uint8Array([1, 2, 3]))
    zip.file('IceGirl/脸红.exp3.json', createExpressionText('ParamBlush'))

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())
    const settings = await ZipLoader.createSettings(reader)

    expect(expressionMetadata(settings)).toMatchObject([
      {
        name: '脸红',
        fileName: 'IceGirl/脸红.exp3.json',
        data: {
          Type: 'Live2D Expression',
          Parameters: [
            { Id: 'ParamBlush', Value: 1, Blend: 'Add' },
          ],
        },
      },
    ])
  })

  it('loads a zip model whose model3.json references non-ASCII file paths', async () => {
    await import('./live2d-zip-loader')
    const { ZipLoader } = await import('pixi-live2d-display/cubism4')

    const zip = new JSZip()
    zip.file('悠小喵.model3.json', createYouxiaomiaoSettingsText())
    zip.file('悠小喵.moc3', new Uint8Array([77, 79, 67, 51]))
    zip.file('悠小喵.8192/texture_00.png', new Uint8Array([1, 2, 3]))
    zip.file('悠小喵.physics3.json', '{}')
    zip.file('悠小喵.cdi3.json', '{}')
    zip.file('exp/常规.motion3.json', '{}')

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())
    const settings = await ZipLoader.createSettings(reader)
    const files = await ZipLoader.unzip(reader, settings)

    expect(settings.url).toBe(encodeURI('悠小喵.model3.json'))
    expect(settings.moc).toBe(encodeURI('悠小喵.moc3'))
    expect(() => settings.validateFiles(files.map(file => encodeURI(file.webkitRelativePath)))).not.toThrow()
  })

  it('loads an OPFS-restored file directory when model3.json contains Physics: null', async () => {
    await import('./live2d-zip-loader')
    const { FileLoader } = await import('pixi-live2d-display/cubism4')

    const files = [
      fileWithRelativePath(
        createShisihangshiSettingsText(),
        '302301_shisihangshi.model3.json',
        '302301_shisihangshi/302301_shisihangshi.model3.json',
      ),
      fileWithRelativePath(
        new Uint8Array([77, 79, 67, 51]),
        '302301_shisihangshi.moc3',
        '302301_shisihangshi/302301_shisihangshi.moc3',
      ),
      fileWithRelativePath(
        new Uint8Array([1, 2, 3]),
        '302301_shisihangshi_00.png',
        '302301_shisihangshi/textures/302301_shisihangshi_00.png',
      ),
      fileWithRelativePath(
        '{}',
        't_idle.motion3.json',
        '302301_shisihangshi/motions/t_idle.motion3.json',
      ),
    ]

    const settings = await FileLoader.createSettings(files)

    expect(settings.physics).toBeUndefined()
    expect(() => settings.validateFiles(files.map(file => encodeURI(file.webkitRelativePath)))).not.toThrow()
  })

  it('loads an OPFS-restored file directory when a macOS AppleDouble settings sidecar is present before the real settings file', async () => {
    await import('./live2d-zip-loader')
    const { FileLoader } = await import('pixi-live2d-display/cubism4')

    const files = [
      fileWithRelativePath(
        appleDoubleHeader,
        '._302301_shisihangshi.model3.json',
        '__MACOSX/302301_shisihangshi/._302301_shisihangshi.model3.json',
      ),
      fileWithRelativePath(
        createShisihangshiSettingsText(),
        '302301_shisihangshi.model3.json',
        '302301_shisihangshi/302301_shisihangshi.model3.json',
      ),
      fileWithRelativePath(
        new Uint8Array([77, 79, 67, 51]),
        '302301_shisihangshi.moc3',
        '302301_shisihangshi/302301_shisihangshi.moc3',
      ),
      fileWithRelativePath(
        new Uint8Array([1, 2, 3]),
        '302301_shisihangshi_00.png',
        '302301_shisihangshi/textures/302301_shisihangshi_00.png',
      ),
      fileWithRelativePath(
        '{}',
        't_idle.motion3.json',
        '302301_shisihangshi/motions/t_idle.motion3.json',
      ),
    ]

    const settings = await FileLoader.createSettings(files)

    expect(settings.url).toBe('302301_shisihangshi/302301_shisihangshi.model3.json')
    expect(settings.physics).toBeUndefined()
  })

  it('loads an OPFS-restored file directory whose model3.json references non-ASCII file paths', async () => {
    await import('./live2d-zip-loader')
    const { FileLoader } = await import('pixi-live2d-display/cubism4')

    const files = [
      fileWithRelativePath(
        createYouxiaomiaoSettingsText(),
        '悠小喵.model3.json',
        '悠小喵.model3.json',
      ),
      fileWithRelativePath(
        new Uint8Array([77, 79, 67, 51]),
        '悠小喵.moc3',
        '悠小喵.moc3',
      ),
      fileWithRelativePath(
        new Uint8Array([1, 2, 3]),
        'texture_00.png',
        '悠小喵.8192/texture_00.png',
      ),
      fileWithRelativePath(
        '{}',
        '悠小喵.physics3.json',
        '悠小喵.physics3.json',
      ),
      fileWithRelativePath(
        '{}',
        '悠小喵.cdi3.json',
        '悠小喵.cdi3.json',
      ),
      fileWithRelativePath(
        '{}',
        '常规.motion3.json',
        'exp/常规.motion3.json',
      ),
    ]

    const settings = await FileLoader.createSettings(files)

    expect(settings.url).toBe(encodeURI('悠小喵.model3.json'))
    expect(settings.moc).toBe(encodeURI('悠小喵.moc3'))
    expect(() => settings.validateFiles(files.map(file => encodeURI(file.webkitRelativePath)))).not.toThrow()
  })

  it('extracts undeclared exp3 files from OPFS-restored file directories for expression auto-discovery', async () => {
    await import('./live2d-zip-loader')
    const { FileLoader } = await import('pixi-live2d-display/cubism4')

    const files = [
      fileWithRelativePath(
        createShisihangshiSettingsText(),
        'IceGirl.model3.json',
        'IceGirl/IceGirl.model3.json',
      ),
      fileWithRelativePath(
        new Uint8Array([77, 79, 67, 51]),
        'IceGirl.moc3',
        'IceGirl/IceGirl.moc3',
      ),
      fileWithRelativePath(
        new Uint8Array([1, 2, 3]),
        'texture_00.png',
        'IceGirl/textures/texture_00.png',
      ),
      fileWithRelativePath(
        createExpressionText('ParamTear'),
        '流泪.exp3.json',
        'IceGirl/流泪.exp3.json',
      ),
    ]

    const settings = await FileLoader.createSettings(files)

    expect(expressionMetadata(settings)).toMatchObject([
      {
        name: '流泪',
        fileName: 'IceGirl/流泪.exp3.json',
        data: {
          Type: 'Live2D Expression',
          Parameters: [
            { Id: 'ParamTear', Value: 1, Blend: 'Add' },
          ],
        },
      },
    ])
  })
})
