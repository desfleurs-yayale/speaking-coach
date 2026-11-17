// Built-in lesson catalogue. The "lessons" child fills src/lessons/data.ts; keep this file as the entry.
import type { Lesson, LessonLevel, LessonTheme } from '../lib/types'
import { LESSONS } from './data'

export { LESSONS }

export const THEMES: { id: LessonTheme; name: string; emoji: string }[] = [
  { id: 'daily', name: '日常生活', emoji: '☁️' },
  { id: 'travel', name: '旅行出行', emoji: '✈️' },
  { id: 'work', name: '职场面试', emoji: '💼' },
  { id: 'food', name: '点餐美食', emoji: '🍰' },
  { id: 'feelings', name: '情绪表达', emoji: '💗' },
  { id: 'campus', name: '校园学习', emoji: '📚' },
]

export const LEVEL_NAMES: Record<LessonLevel, string> = { 1: '入门', 2: '进阶', 3: '挑战' }

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id)
}
