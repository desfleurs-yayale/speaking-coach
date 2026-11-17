// Shared data types. Owned by the parent (integration). Children: additive changes only, tell the parent.

export type DreamSceneId = 'sky' | 'meadow' | 'ocean' | 'dusk' | 'night'

export type LessonTheme = 'daily' | 'travel' | 'work' | 'food' | 'feelings' | 'campus'

export type LessonLevel = 1 | 2 | 3 // 1 = beginner, 2 = intermediate, 3 = advanced

export interface LessonSentence {
  id: string // unique inside the lesson, e.g. "s1"
  text: string // English sentence the user reads aloud
  zh: string // Chinese translation shown under the subtitle
}

export interface Lesson {
  id: string // url-safe, unique, e.g. "daily-morning-coffee"
  title: string // English title
  titleZh: string // Chinese title
  theme: LessonTheme
  level: LessonLevel
  scene: DreamSceneId // dream background used while shadowing this lesson
  description: string // one Chinese sentence shown on the lesson card
  sentences: LessonSentence[]
  custom?: boolean // true for lessons the user pasted in
}

export interface SentenceResult {
  sentenceId: string
  text: string
  hitWords: number
  totalWords: number
  missedWords: string[] // normalized lowercase words the user did not hit
  attempts: number // how many times the user tried this sentence
}

export interface ShadowingSession {
  id: string
  type: 'shadowing'
  lessonId: string
  lessonTitle: string
  startedAt: number // epoch ms
  durationMs: number
  score: number // 0-100, overall word hit rate
  sentences: SentenceResult[]
  recordingId?: string // key into the recordings store
}

export type PracticeSession = ShadowingSession

export interface RecordingBlob {
  id: string
  sessionId: string
  blob: Blob
  mimeType: string
  createdAt: number
}

export interface VocabItem {
  word: string // normalized lowercase key
  display: string // as it appeared in the sentence
  context: string // the sentence it came from
  contextZh?: string
  lessonId?: string
  addedAt: number
  reviewCount: number
  lastReviewedAt?: number
  mastered: boolean
}
