import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ActivityChart } from '../components/ActivityChart'
import { AppShell } from '../components/AppShell'
import { Stat } from '../components/Stat'
import { listSessions, listVocab } from '../lib/db'
import { dailyActivity, dayLabel, formatTotal, streakDays } from '../lib/format'
import { speak, stopSpeaking } from '../lib/tts'
import { useLiveData } from '../lib/useLiveData'
import styles from './HomePage.module.css'

const SENTENCE = 'Say it out loud and watch the sky light up.'
const WORDS = SENTENCE.split(' ')
// character offset where each word starts, to map TTS boundary events to words
const WORD_STARTS = WORDS.reduce<number[]>((acc, _w, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + WORDS[i - 1].length + 1)
  return acc
}, [])

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function useLitWords() {
  const [lit, setLit] = useState(0)
  const timer = useRef<number | undefined>(undefined)

  const play = (stepMs = 260) => {
    window.clearInterval(timer.current)
    if (prefersReducedMotion()) return setLit(WORDS.length)
    setLit(0)
    let n = 0
    timer.current = window.setInterval(() => {
      n++
      setLit(n)
      if (n >= WORDS.length) window.clearInterval(timer.current)
    }, stepMs)
  }

  useEffect(() => {
    const start = window.setTimeout(() => play(), 500)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(timer.current)
      stopSpeaking()
    }
  }, [])

  const listen = async () => {
    window.clearInterval(timer.current)
    setLit(0)
    let sawBoundary = false
    // fall back to a steady pace if the voice sends no word boundaries
    const fallback = window.setTimeout(() => !sawBoundary && play(330), 700)
    await speak(SENTENCE, {
      rate: 0.9,
      onBoundary: (charIndex) => {
        sawBoundary = true
        const i = WORD_STARTS.findLastIndex((s) => s <= charIndex)
        setLit((prev) => Math.max(prev, i + 1))
      },
    })
    window.clearTimeout(fallback)
    if (sawBoundary) setLit(WORDS.length)
  }

  return { lit, listen }
}

export default function HomePage() {
  const { lit, listen } = useLitWords()
  const sessions = useLiveData(listSessions, ['sessions'])
  const vocab = useLiveData(listVocab, ['vocab'])
  const all = sessions.data ?? []
  const latest = all[0]
  const total = formatTotal(all.reduce((sum, s) => sum + s.durationMs, 0))
  const recent = all.slice(0, 10)
  const avg = recent.length ? Math.round(recent.reduce((sum, s) => sum + s.score, 0) / recent.length) : 0
  const words = vocab.data ?? []
  const toReview = words.filter((w) => !w.mastered).length

  return (
    <AppShell>
      <section className={styles.hero}>
        <h1 className={styles.sentence} aria-label={SENTENCE}>
          {WORDS.map((w, i) => (
            <span key={i} aria-hidden="true" className={i < lit ? styles.lit : styles.word}>
              {w}
            </span>
          ))}
        </h1>
        <p className={styles.zh}>大声读出来，看天空为你亮起。</p>
        <p className={styles.lede}>
          打开摄像头，跟着画面里的英文字幕读。每读中一个词，它就会亮起来，落下一串星光；举起双手，房间会变成梦里的天空。
        </p>
        <div className={styles.actions}>
          <Link className="btn btn-primary" to="/shadowing">
            选一篇开始跟读
          </Link>
          <button type="button" className="btn btn-ghost" onClick={listen}>
            听这句
          </button>
        </div>
      </section>

      <section className={styles.modes} aria-label="练习模式">
        <Link to="/shadowing" className={`glass ${styles.mode} ${styles.modeMain}`}>
          <h2 className={styles.modeTitle}>跟读</h2>
          <ol className={styles.steps}>
            <li>选今天要读的内容，或贴一段自己的英文</li>
            <li>打开摄像头，字幕出现在画面里</li>
            <li>一句一句读，读中的词会发光</li>
          </ol>
          <span className={styles.modeCta}>去选内容</span>
        </Link>
        <div className={`glass ${styles.mode} ${styles.modeSoon}`} aria-disabled="true">
          <h2 className={styles.modeTitle}>
            对话 <span className="chip">即将推出</span>
          </h2>
          <p className={styles.modeText}>像打视频电话一样，和一位特别的 AI 老师聊英语。还在准备中。</p>
        </div>
      </section>

      <section className={`glass ${styles.progress}`} aria-label="我的练习">
        <div className={styles.progressHead}>
          <h2 className={styles.sectionTitle}>我的练习</h2>
          {all.length > 0 && (
            <Link className={styles.more} to="/records">
              全部记录
            </Link>
          )}
        </div>
        {sessions.loading ? null : all.length === 0 ? (
          <p className={styles.empty}>完成第一次跟读后，这里会显示连续练习天数、每天的练习时长和最近的得分。</p>
        ) : (
          <div className={styles.progressBody}>
            <div className={styles.stats}>
              <Stat label="连续练习" value={String(streakDays(all))} unit="天" />
              <Stat label="累计时长" value={total.value} unit={total.unit} note={`共 ${all.length} 次`} />
              <Stat label="平均得分" value={String(avg)} note={`最近 ${recent.length} 次`} />
              <Stat label="生词本" value={String(words.length)} unit="个" note={`${toReview} 个待复习`} />
            </div>
            <div className={styles.chartWrap}>
              <ActivityChart days={dailyActivity(all)} />
              {latest && (
                <Link className={styles.latest} to={`/shadowing/result/${latest.id}`}>
                  上次：{latest.lessonTitle}，{dayLabel(latest.startedAt)}，{latest.score} 分
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  )
}
