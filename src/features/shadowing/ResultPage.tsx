// /shadowing/result/:sessionId — score, per-sentence results, missed words to collect, and the recording.
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { AppShell } from '../../components/AppShell'
import { addVocab, getRecording, getSession, hasVocab, listCustomLessons, normalizeWord, onDataChanged } from '../../lib/db'
import type { Lesson, SentenceResult, ShadowingSession } from '../../lib/types'
import { getLesson } from '../../lessons'
import { splitWords } from './matcher'
import { recordingExtension } from './recorder'
import styles from './Result.module.css'

type Loaded = { id: string; session: ShadowingSession | null; lesson: Lesson | null }

function comment(score: number) {
  if (score >= 95) return '完美！每个词都闪闪发光 ✦'
  if (score >= 85) return '非常棒，发音清晰又流畅！'
  if (score >= 70) return '很不错，再练几遍就更自然了。'
  if (score >= 50) return '有进步的空间，放慢一点，逐词读清楚。'
  return '先听原句，再跟着慢慢读，梦会越来越亮。'
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m ? `${m} 分 ${s % 60} 秒` : `${s} 秒`
}

/** The sentence with missed words highlighted (each missed word marked as many times as it was missed). */
function MarkedSentence({ r }: { r: SentenceResult }) {
  const left = new Map<string, number>()
  for (const w of r.missedWords) left.set(w, (left.get(w) ?? 0) + 1)
  return (
    <p className={styles.sentence} lang="en">
      {splitWords(r.text).map((w, i) => {
        const key = normalizeWord(w)
        const n = left.get(key) ?? 0
        if (n) left.set(key, n - 1)
        return (
          <Fragment key={i}>
            {i > 0 && ' '}
            {n ? <mark className={styles.missed}>{w}</mark> : w}
          </Fragment>
        )
      })}
    </p>
  )
}

export default function ResultPage() {
  const { sessionId = '' } = useParams()
  const location = useLocation()
  const recordingFailed = (location.state as { recordingFailed?: boolean } | null)?.recordingFailed
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [video, setVideo] = useState<{ url: string; ext: string } | null>(null)
  const [inVocab, setInVocab] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const raw = await getSession(sessionId).catch(() => undefined)
      const session = raw?.type === 'shadowing' ? raw : null
      let lesson: Lesson | null = null
      if (session) {
        lesson =
          getLesson(session.lessonId) ??
          (await listCustomLessons().catch(() => [] as Lesson[])).find((l) => l.id === session.lessonId) ??
          null
      }
      if (alive) setLoaded({ id: sessionId, session, lesson })
    })()
    return () => {
      alive = false
    }
  }, [sessionId])

  const session = loaded?.id === sessionId ? loaded.session : undefined
  const recordingId = session?.recordingId

  useEffect(() => {
    if (!recordingId) return
    let url = ''
    let alive = true
    getRecording(recordingId)
      .then((r) => {
        if (!alive || !r) return
        url = URL.createObjectURL(r.blob)
        setVideo({ url, ext: recordingExtension(r.mimeType || r.blob.type) })
      })
      .catch(() => {})
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
      setVideo(null)
    }
  }, [recordingId])

  // Missed words with the sentence they came from (first occurrence wins).
  const missed = useMemo(() => {
    const out = new Map<string, { display: string; context: string; contextZh?: string }>()
    if (!session) return out
    const lesson = loaded?.lesson
    for (const r of session.sentences) {
      const zh = lesson?.sentences.find((s) => s.id === r.sentenceId)?.zh || undefined
      const words = splitWords(r.text)
      for (const key of r.missedWords) {
        if (out.has(key)) continue
        const written = words.find((w) => normalizeWord(w) === key)
        const display = written ? written.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') : key
        out.set(key, { display: display || key, context: r.text, contextZh: zh })
      }
    }
    return out
  }, [session, loaded])

  useEffect(() => {
    let alive = true
    const check = async () => {
      const keys = [...missed.keys()]
      const flags = await Promise.all(keys.map((k) => hasVocab(k).catch(() => false)))
      if (alive) setInVocab(new Set(keys.filter((_, i) => flags[i])))
    }
    void check()
    const off = onDataChanged((store) => {
      if (store === 'vocab') void check()
    })
    return () => {
      alive = false
      off()
    }
  }, [missed])

  const add = async (keys: string[]) => {
    setBusy(true)
    try {
      for (const key of keys) {
        const m = missed.get(key)
        if (!m || inVocab.has(key)) continue
        await addVocab({ word: key, display: m.display, context: m.context, contextZh: m.contextZh, lessonId: session?.lessonId })
      }
      setInVocab((prev) => new Set([...prev, ...keys]))
    } catch {
      window.alert('加入生词本失败，请稍后再试。')
    } finally {
      setBusy(false)
    }
  }

  if (session === undefined) {
    return (
      <AppShell>
        <p className="dream-title" style={{ fontSize: 28 }}>
          loading the dream…
        </p>
      </AppShell>
    )
  }
  if (!session) {
    return (
      <AppShell>
        <div className={`glass ${styles.panel}`}>
          <h2>找不到这次练习</h2>
          <p className="muted">记录可能已被删除。</p>
          <div className={styles.actions}>
            <Link className="btn btn-primary" to="/shadowing">
              选择内容
            </Link>
            <Link className="btn" to="/records">
              学习记录
            </Link>
          </div>
        </div>
      </AppShell>
    )
  }

  const missedKeys = [...missed.keys()]
  const pending = missedKeys.filter((k) => !inVocab.has(k))
  const date = new Date(session.startedAt)
  const fileName = `dream-speak-${session.lessonTitle.replace(/[^\w-]+/g, '-').toLowerCase()}-${date.toISOString().slice(0, 10)}`

  return (
    <AppShell>
      <section className={`glass ${styles.hero}`}>
        <div className={styles.scoreBox}>
          <span className={`dream-title ${styles.score}`}>{session.score}</span>
          <span className={styles.unit}>分</span>
        </div>
        <div className={styles.heroText}>
          <p className={styles.comment}>{comment(session.score)}</p>
          <h1 lang="en">{session.lessonTitle}</h1>
          <p className="muted">
            {date.toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 用时{' '}
            {formatDuration(session.durationMs)} · 完成 {session.sentences.length}
            {loaded?.lesson ? ` / ${loaded.lesson.sentences.length}` : ''} 句
          </p>
          <div className={styles.actions}>
            <Link className="btn btn-primary" to={`/shadowing/session/${encodeURIComponent(session.lessonId)}`}>
              再练一次
            </Link>
            <Link className="btn" to="/shadowing">
              选择其他内容
            </Link>
            <Link className="btn" to="/records">
              学习记录
            </Link>
          </div>
        </div>
      </section>

      {(video || recordingFailed) && (
        <section className={`glass ${styles.block}`}>
          <h2>跟读录像</h2>
          {video ? (
            <>
              <video className={styles.video} src={video.url} controls playsInline />
              <a className="btn" href={video.url} download={`${fileName}.${video.ext}`}>
                ⬇ 下载录像
              </a>
            </>
          ) : (
            <p className="muted">这次的录像没有保存成功（可能是浏览器不支持录制，或存储空间不足）。</p>
          )}
        </section>
      )}

      {missedKeys.length > 0 && (
        <section className={`glass ${styles.block}`}>
          <div className={styles.blockHead}>
            <h2>没读到的单词</h2>
            <button className="btn" onClick={() => void add(pending)} disabled={busy || !pending.length}>
              {pending.length ? `全部加入生词本（${pending.length}）` : '已全部加入生词本'}
            </button>
          </div>
          <ul className={styles.words}>
            {missedKeys.map((k) => {
              const m = missed.get(k)!
              const saved = inVocab.has(k)
              return (
                <li key={k}>
                  <strong lang="en">{m.display}</strong>
                  <button className={styles.addBtn} onClick={() => void add([k])} disabled={busy || saved}>
                    {saved ? '✓ 已在生词本' : '加入生词本'}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className={`glass ${styles.block}`}>
        <h2>逐句结果</h2>
        {session.sentences.length ? (
          <ol className={styles.list}>
            {session.sentences.map((r) => {
              const full = r.totalWords > 0 && r.hitWords === r.totalWords
              return (
                <li key={r.sentenceId} className={full ? styles.perfect : ''}>
                  <MarkedSentence r={r} />
                  <span className={styles.ratio}>
                    {full ? '✦ ' : ''}
                    {r.hitWords} / {r.totalWords}
                    {r.attempts > 1 ? ` · ${r.attempts} 次` : ''}
                  </span>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="muted">这次没有读任何句子。</p>
        )}
      </section>
    </AppShell>
  )
}
