import { describe, expect, it } from 'vitest'

import { Emotion } from '../constants/emotions'
import { inferResponseEmotion, selectExpressionForEmotion } from './response-performance'

describe('response performance matching', () => {
  it('matches Chinese happiness content', () => {
    const result = inferResponseEmotion('太好了，恭喜你完成了！')

    expect(result.name).toBe(Emotion.Happy)
    expect(result.intensity).toBeGreaterThan(0.7)
  })

  it('matches English sadness content', () => {
    expect(inferResponseEmotion('I am sorry. Unfortunately, that did not work.').name).toBe(Emotion.Sad)
  })

  it('uses a question pose for an otherwise neutral question', () => {
    expect(inferResponseEmotion('你希望我接下来怎么做？')).toEqual({
      name: Emotion.Question,
      intensity: 0.65,
    })
  })

  it('keeps ordinary factual answers neutral', () => {
    expect(inferResponseEmotion('文件已经保存到工作目录。')).toEqual({
      name: Emotion.Neutral,
      intensity: 0.45,
    })
  })

  it('selects a model-specific expression by semantic alias', () => {
    expect(selectExpressionForEmotion(Emotion.Happy, ['F01', 'Happy Smile', 'F03'])).toBe('Happy Smile')
    expect(selectExpressionForEmotion(Emotion.Angry, ['开心', '生气脸'])).toBe('生气脸')
  })

  it('does not invent an expression when the model has no matching preset', () => {
    expect(selectExpressionForEmotion(Emotion.Sad, ['F01', 'F02'])).toBeUndefined()
  })
})
