// PLACEHOLDER: the "lessons" child replaces this with the full catalogue.
import type { Lesson } from '../lib/types'

export const LESSONS: Lesson[] = [
  {
    id: 'daily-morning-coffee',
    title: 'Morning Coffee',
    titleZh: '早上的咖啡',
    theme: 'daily',
    level: 1,
    scene: 'sky',
    description: '在咖啡店点一杯早晨的咖啡。',
    sentences: [
      { id: 's1', text: 'Good morning! Can I get a large latte, please?', zh: '早上好！请给我一杯大杯拿铁。' },
      { id: 's2', text: 'Could you make it with oat milk?', zh: '可以用燕麦奶做吗？' },
      { id: 's3', text: 'That smells amazing. Thank you so much!', zh: '闻起来太香了，非常感谢！' },
    ],
  },
]
