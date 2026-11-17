import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ActivityChart } from '../components/ActivityChart'
import { AppShell } from '../components/AppShell'
import { Stat } from '../components/Stat'
import { deleteSession, getRecording, listSessions } from '../lib/db'
import { dailyActivity, dayKey, dayLabel, formatDuration, formatTotal, streakDays, timeLabel } from '../lib/format'
import type { PracticeSession } from '../lib/types'
import { useLiveData } from '../lib/useLiveData'
import styles from './RecordsPage.module.css'

function groupByDay(sessions: PracticeSession[]) {
  const groups: { key: string; ts: number; items: PracticeSession[] }[] = []
  for (const s of sessions) {
    const key = dayKey(s.startedAt)
    const g = groups.at(-1)
    if (g?.key === key) g.items.push(s)
    else groups.push({ key, ts: s.startedAt, items: [s] })
  }
  return groups
}

function extFor(mime: string) {
  return mime.includes('mp4') ? 'mp4' : 'webm'
}

/** Loads a stored recording into an object URL while mounted. */
function RecordingPlayer({ recordingId, fileName }: { recordingId: string; fileName: string }) {
  const [rec, setRec] = useState<{ url: string; ext: string } | null | 'missing'>(null)

  useEffect(() => {
    let url: string | undefined
    let alive = true
    getRecording(recordingId).then((r) => {
      if (!alive) return
      if (!r) return setRec('missing')
      url = URL.createObjectURL(r.blob)
      setRec({ url, ext: extFor(r.mimeType) })
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [recordingId])

  if (rec === null) return <p className="muted">正在读取录像…</p>
  if (rec === 'missing') return <p className="muted">这次练习的录像找不到了，可能已被浏览器清理。</p>
  return (
    <div className={styles.player}>
      <video src={rec.url} controls playsInline className={styles.video} />
      <a className="btn" href={rec.url} download={`${fileName}.${rec.ext}`}>
        下载录像
      </a>
    </div>
  )
}

function SessionRow({ s }: { s: PracticeSession }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const hit = s.sentences.reduce((n, x) => n + x.hitWords, 0)
  const totalWords = s.sentences.reduce((n, x) => n + x.totalWords, 0)
  const missed = new Set(s.sentences.flatMap((x) => x.missedWords)).size
  const fileName = `dream-speak-${dayKey(s.startedAt)}-${s.lessonTitle.replace(/[^\w-]+/g, '-').toLowerCase()}`

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.score} aria-label={`${s.score} 分`}>
          {s.score}
        </span>
        <div className={styles.info}>
          <Link to={`/shadowing/result/${s.id}`} className={styles.lessonTitle}>
            {s.lessonTitle}
          </Link>
          <div className={styles.meta}>
            <span>{timeLabel(s.startedAt)}</span>
            <span>{formatDuration(s.durationMs)}</span>
            <span>
              读中 {hit}/{totalWords} 个词
            </span>
            {missed > 0 && <span>{missed} 个没读中</span>}
          </div>
        </div>
        <div className={styles.rowActions}>
          {s.recordingId && (
            <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? '收起录像' : '看录像'}
            </button>
          )}
          {confirming ? (
            <>
              <button type="button" className={`btn ${styles.danger}`} onClick={() => deleteSession(s.id)}>
                确认删除
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                取消
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirming(true)}>
              删除
            </button>
          )}
        </div>
      </div>
      {confirming && (
        <p className={styles.warn}>删除后，这次练习的得分{s.recordingId ? '和录像' : ''}都会从这台电脑上移除，无法恢复。</p>
      )}
      {open && s.recordingId && <RecordingPlayer recordingId={s.recordingId} fileName={fileName} />}
    </li>
  )
}

export default function RecordsPage() {
  const { data, loading } = useLiveData(listSessions, ['sessions'])
  const all = data ?? []
  const total = formatTotal(all.reduce((sum, s) => sum + s.durationMs, 0))
  const best = all.reduce((m, s) => Math.max(m, s.score), 0)
  const recent = all.slice(0, 10)
  const avg = recent.length ? Math.round(recent.reduce((sum, s) => sum + s.score, 0) / recent.length) : 0

  return (
    <AppShell>
      <h1 className={styles.heading}>学习记录</h1>

      {loading ? null : all.length === 0 ? (
        <div className={`glass ${styles.empty}`}>
          <p>还没有练习记录。每次跟读结束后，得分和录像都会保存在这里，只存在这台电脑的浏览器里。</p>
          <Link className="btn btn-primary" to="/shadowing">
            开始第一次跟读
          </Link>
        </div>
      ) : (
        <>
          <section className={`glass ${styles.summary}`} aria-label="练习概况">
            <div className={styles.stats}>
              <Stat label="连续练习" value={String(streakDays(all))} unit="天" />
              <Stat label="累计时长" value={total.value} unit={total.unit} note={`共 ${all.length} 次`} />
              <Stat label="平均得分" value={String(avg)} note={`最近 ${recent.length} 次`} />
              <Stat label="最高得分" value={String(best)} />
            </div>
            <ActivityChart days={dailyActivity(all)} />
          </section>

          {groupByDay(all).map((g) => (
            <section key={g.key} className={styles.day}>
              <h2 className={styles.dayTitle}>{dayLabel(g.ts)}</h2>
              <ul className={`glass ${styles.list}`}>
                {g.items.map((s) => (
                  <SessionRow key={s.id} s={s} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </AppShell>
  )
}
