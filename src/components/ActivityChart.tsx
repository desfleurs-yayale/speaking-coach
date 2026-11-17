// 14-day practice-time column chart. One series (minutes per day), one hue, hover/focus tooltip per column,
// and a visually hidden table for screen readers.
import { useState } from 'react'
import type { DayActivity } from '../lib/format'
import styles from './ActivityChart.module.css'

function dateLabel(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function minutes(ms: number) {
  if (ms <= 0) return 0
  return Math.max(1, Math.round(ms / 60000))
}

export function ActivityChart({ days, title = '最近 14 天练习时长' }: { days: DayActivity[]; title?: string }) {
  const [active, setActive] = useState<number | null>(null)
  const mins = days.map((d) => minutes(d.ms))
  const peak = Math.max(...mins)
  const scaleMax = Math.max(10, peak) // keep a 3-minute day from looking like a full column
  const peakIndex = peak > 0 ? mins.lastIndexOf(peak) : -1
  const last = days.length - 1

  return (
    <figure className={styles.chart}>
      <figcaption className={styles.title}>{title}</figcaption>
      <div className={styles.plot} onPointerLeave={() => setActive(null)}>
        {days.map((d, i) => {
          const m = mins[i]
          const h = m > 0 ? Math.max(4, (m / scaleMax) * 100) : 0
          const label = i === last ? '今天' : String(new Date(d.ts).getDate())
          return (
            <div
              key={d.key}
              className={`${styles.col} ${active === i ? styles.colActive : ''}`}
              tabIndex={0}
              aria-label={`${dateLabel(d.ts)}，练习 ${m} 分钟，${d.count} 次`}
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <div className={styles.track}>
                {i === peakIndex && <span className={styles.peak} style={{ bottom: `${h}%` }}>{m}</span>}
                {h > 0 && <div className={styles.bar} style={{ height: `${h}%` }} />}
              </div>
              <span className={`${styles.tick} ${i === last ? styles.today : ''}`}>{label}</span>
              {active === i && (
                <div
                  className={`${styles.tip} ${i < 2 ? styles.tipStart : i > last - 2 ? styles.tipEnd : ''}`}
                  role="presentation"
                >
                  <strong>{m} 分钟</strong>
                  <span>{dateLabel(d.ts)}</span>
                  <span>练习 {d.count} 次</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <table className={styles.srOnly}>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">分钟</th>
            <th scope="col">次数</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.key}>
              <td>{dateLabel(d.ts)}</td>
              <td>{mins[i]}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
