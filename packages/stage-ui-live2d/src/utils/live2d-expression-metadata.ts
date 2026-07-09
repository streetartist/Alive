export interface Live2DExpressionMetadataFile {
  /** Display name derived from the exp3 file name. */
  name: string
  /** Path of the exp3 file within the loaded model file set. */
  fileName: string
  /** Parsed exp3 JSON payload. */
  data: Record<string, unknown>
}

export interface Live2DExpressionReference {
  Name: string
  File: string
}

export interface Live2DExpressionMetadataSettings {
  _expFiles?: Live2DExpressionMetadataFile[]
}

export function isLive2DExpressionFilePath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.exp3.json')
}

export function normalizeLive2DArchivePath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\.\/+/, '')
}

export function expressionNameFromPath(filePath: string): string {
  const baseName = normalizeLive2DArchivePath(filePath).split('/').pop() || filePath
  return baseName.replace(/\.exp3\.json$/i, '')
}

export function parseLive2DExpressionMetadata(filePath: string, text: string): Live2DExpressionMetadataFile {
  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expression file must contain a JSON object: ${filePath}`)
  }

  return {
    name: expressionNameFromPath(filePath),
    fileName: normalizeLive2DArchivePath(filePath),
    data: parsed as Record<string, unknown>,
  }
}

export function expressionReferenceFromMetadata(file: Live2DExpressionMetadataFile): Live2DExpressionReference {
  return {
    Name: file.name,
    File: file.fileName,
  }
}
