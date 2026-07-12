import { Emotion } from '../constants/emotions'

interface EmotionRule {
  emotion: Emotion
  keywords: readonly string[]
}

const emotionRules: readonly EmotionRule[] = [
  {
    emotion: Emotion.Happy,
    keywords: ['开心', '高兴', '太好了', '恭喜', '喜欢', '爱你', '哈哈', '嘿嘿', 'yay', 'great', 'glad', 'happy', 'congratulations', 'love', 'wonderful', '😊', '😄', '🥰', '🎉'],
  },
  {
    emotion: Emotion.Sad,
    keywords: ['难过', '伤心', '遗憾', '抱歉', '可惜', '哭', '失落', 'sad', 'sorry', 'unfortunately', 'regret', 'miss you', '😢', '😭', '💔'],
  },
  {
    emotion: Emotion.Angry,
    keywords: ['生气', '愤怒', '讨厌', '可恶', '过分', '不能接受', 'angry', 'furious', 'annoying', 'unacceptable', 'hate', '😠', '😡'],
  },
  {
    emotion: Emotion.Surprise,
    keywords: ['惊讶', '震惊', '没想到', '竟然', '真的吗', '天啊', '哇', 'surprised', 'shocked', 'really', 'wow', 'unexpected', '😮', '😲'],
  },
  {
    emotion: Emotion.Awkward,
    keywords: ['尴尬', '不好意思', '呃', '额', '这个嘛', 'awkward', 'embarrassed', 'oops', 'uh', '😅', '🫣'],
  },
  {
    emotion: Emotion.Curious,
    keywords: ['好奇', '想知道', '有意思', '让我看看', '探索', 'curious', 'wonder', 'interesting', 'let me see', 'explore', '🤔', '👀'],
  },
  {
    emotion: Emotion.Think,
    keywords: ['我想想', '让我想想', '分析一下', '考虑', '推测', '可能是', 'think', 'consider', 'analyze', 'perhaps', 'probably', '🧐'],
  },
]

const expressionAliases: Readonly<Record<Emotion, readonly string[]>> = {
  [Emotion.Happy]: ['happy', 'smile', 'joy', 'laugh', '开心', '高兴', '微笑', '笑'],
  [Emotion.Sad]: ['sad', 'cry', 'tear', '悲伤', '伤心', '难过', '哭'],
  [Emotion.Angry]: ['angry', 'mad', 'rage', '生气', '愤怒'],
  [Emotion.Think]: ['think', 'serious', '思考', '认真'],
  [Emotion.Surprise]: ['surprise', 'surprised', 'shock', '惊讶', '震惊'],
  [Emotion.Awkward]: ['awkward', 'embarrass', 'shy', '尴尬', '害羞'],
  [Emotion.Question]: ['question', 'confused', '疑问', '困惑'],
  [Emotion.Curious]: ['curious', 'interest', '好奇', '感兴趣'],
  [Emotion.Neutral]: ['neutral', 'normal', 'idle', '默认', '普通'],
}

function keywordScore(text: string, keywords: readonly string[]): number {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? Math.max(1, keyword.length / 3) : 0), 0)
}

/**
 * Infers a restrained stage emotion from a completed assistant response.
 *
 * Explicit ACT signals should always take precedence over this fallback. The
 * matcher intentionally returns neutral for ordinary factual responses so the
 * character does not change pose on every sentence.
 */
export function inferResponseEmotion(message: string): { name: Emotion, intensity: number } {
  const normalized = message.trim().toLowerCase()
  if (!normalized)
    return { name: Emotion.Neutral, intensity: 0.45 }

  let bestEmotion: Emotion | undefined
  let bestScore = 0
  for (const rule of emotionRules) {
    const score = keywordScore(normalized, rule.keywords)
    if (score > bestScore) {
      bestEmotion = rule.emotion
      bestScore = score
    }
  }

  if (bestEmotion)
    return { name: bestEmotion, intensity: Math.min(1, 0.55 + bestScore * 0.12) }

  if (/[?？]\s*$/.test(normalized))
    return { name: Emotion.Question, intensity: 0.65 }

  return { name: Emotion.Neutral, intensity: 0.45 }
}

/** Selects a model expression preset whose name semantically matches an emotion. */
export function selectExpressionForEmotion(emotion: Emotion, expressionNames: readonly string[]): string | undefined {
  const aliases = expressionAliases[emotion]
  return expressionNames.find((name) => {
    const normalizedName = name.trim().toLowerCase()
    return aliases.some(alias => normalizedName.includes(alias))
  })
}
