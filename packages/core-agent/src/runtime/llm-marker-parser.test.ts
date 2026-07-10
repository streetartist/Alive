import { describe, expect, it } from 'vitest'

import { stripLlmSpecialMarkers, useLlmmarkerParser } from './llm-marker-parser'

/**
 * @example
 * const parser = useLlmmarkerParser({ onLiteral, onSpecial })
 */
describe('useLlmmarkerParser', () => {
  /**
   * @example
   * Plain model text is emitted as literal output.
   */
  it('parses pure literals', async () => {
    const collectedLiterals: string[] = []
    const parser = useLlmmarkerParser({
      onLiteral: (literal) => {
        collectedLiterals.push(literal)
      },
    })

    await parser.consume('Hello, world!')
    await parser.end()

    expect(collectedLiterals.join('')).toBe('Hello, world!')
  })

  /**
   * @example
   * `<|...|>` markers are emitted as special output.
   */
  it('parses special markers separately from literals', async () => {
    const collectedLiterals: string[] = []
    const collectedSpecials: string[] = []
    const parser = useLlmmarkerParser({
      onLiteral: (literal) => {
        collectedLiterals.push(literal)
      },
      onSpecial: (special) => {
        collectedSpecials.push(special)
      },
    })

    await parser.consume('Hello <|ACT|> world')
    await parser.end()

    expect(collectedLiterals.join('')).toBe('Hello  world')
    expect(collectedSpecials).toEqual(['<|ACT|>'])
  })

  /**
   * @example
   * Unfinished markers are withheld instead of leaking into literal text.
   */
  it('does not include unfinished special markers', async () => {
    const collectedLiterals: string[] = []
    const collectedSpecials: string[] = []
    const parser = useLlmmarkerParser({
      onLiteral: (literal) => {
        collectedLiterals.push(literal)
      },
      onSpecial: (special) => {
        collectedSpecials.push(special)
      },
    })

    await parser.consume('<|unfinished')
    await parser.end()

    expect(collectedLiterals).toEqual([])
    expect(collectedSpecials).toEqual([])
  })

  // https://github.com/moeru-ai/airi/issues — stage bubble leaked ACT/DELAY markers
  // ROOT CAUSE:
  //
  // Final `categorization.speech` was built from raw fullText via categorizeResponse,
  // which does not strip <|ACT|> / <|DELAY|>. UI prefers categorization.speech.
  //
  // stripLlmSpecialMarkers is the shared defense for final speech text.
  it('stripLlmSpecialMarkers removes ACT and DELAY markers from visible speech', () => {
    const raw = '<|ACT {"emotion":"neutral","motion":"sleepy"}|>嗯...早上好...<|DELAY 1|>你是谁呀？'
    expect(stripLlmSpecialMarkers(raw)).toBe('嗯...早上好...你是谁呀？')
  })

  it('stripLlmSpecialMarkers drops incomplete trailing markers', () => {
    expect(stripLlmSpecialMarkers('你好 <|ACT {"emotion":"happy"}')).toBe('你好 ')
  })
})
