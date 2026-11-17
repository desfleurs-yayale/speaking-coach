// Small formatting helpers shared by pages. All output is Chinese UI text.
import type { PracticeSession } from './types'

const DAY = 86_400_000

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m === 0) return `${r} 秒`
  if (r === 0) return `${m} 分钟`
  return `${m} 分 ${r} 秒`
}

/** Total practice time, e.g. "45 分钟" or "2.5 小时". */
export function formatTotal(ms: number): { value: string; unit: string } {
  const min = ms / 60000
  if (min < 90) return { value: String(Math.round(min)), unit: '分钟' }
  return { value: (min / 60).toFixed(1).replace(/\.0$/, ''), unit: '小时' }
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Local calendar day key, YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function dayLabel(ts: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / DAY)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  const d = new Date(ts)
  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${d.getFullYear()}年${md}`
}

export function timeLabel(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Consecutive practice days ending today (or yesterday, if today has no practice yet). */
export function streakDays(sessions: PracticeSession[], now = Date.now()): number {
  const days = new Set(sessions.map((s) => dayKey(s.startedAt)))
  let cursor = startOfDay(now)
  if (!days.has(dayKey(cursor))) cursor -= DAY
  let n = 0
  while (days.has(dayKey(cursor))) {
    n++
    cursor -= DAY
  }
  return n
}

export interface DayActivity {
  key: string
  ts: number
  ms: number
  count: number
}

/** Practice time per day for the last `days` days, oldest first, today last. */
export function dailyActivity(sessions: PracticeSession[], days = 14, now = Date.now()): DayActivity[] {
  const today = startOfDay(now)
  const out: DayActivity[] = []
  for (let i = days - 1; i >= 0; i--) {
    // step by calendar day (DST-safe enough for a practice chart)
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    out.push({ key: dayKey(d.getTime()), ts: d.getTime(), ms: 0, count: 0 })
  }
  const byKey = new Map(out.map((d) => [d.key, d]))
  for (const s of sessions) {
    const d = byKey.get(dayKey(s.startedAt))
    if (d) {
      d.ms += s.durationMs
      d.count++
    }
  }
  return out
}

export function scoreComment(score: number): string {
  if (score >= 90) return '几乎每个词都读到了'
  if (score >= 75) return '读得很顺，再磨几处就完美了'
  if (score >= 50) return '一半以上读中了，多听几遍原句'
  return '先放慢速度，跟着原句一句一句来'
}
