import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { getLesson } from '../lessons'
import { deleteVocab, listVocab, updateVocab } from '../lib/db'
import { dayLabel } from '../lib/format'
import { speak } from '../lib/tts'
import type { VocabItem } from '../lib/types'
import { useLiveData } from '../lib/useLiveData'
import styles from './VocabPage.module.css'

type Filter = 'review' | 'mastered' | 'all'

/** Renders the context sentence with every occurrence of the word highlighted. */
function Context({ text, word }: { text: string; word: string }) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]")
  const parts = text.split(new RegExp(`(\\b${escaped}\\b)`, 'gi'))
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className={styles.mark}>
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  )
}

function markReviewed(v: VocabItem, mastered: boolean) {
  return updateVocab({ ...v, mastered, reviewCount: v.reviewCount + 1, lastReviewedAt: Date.now() })
}

function ReviewCard({ queue, onExit }: { queue: VocabItem[]; onExit: () => void }) {
  // snapshot the queue so items marked as known do not reshuffle the round
  const [round] = useState(() => [...queue].sort((a, b) => (a.lastReviewedAt ?? 0) - (b.lastReviewedAt ?? 0)))
  const [index, setIndex] = useState(0)
  const [reveal, setReveal] = useState(false)
  const v = round[index]

  if (!v) {
    return (
      <div className={`glass ${styles.review}`}>
        <p className={styles.doneText}>这一轮复习完了，共 {round.length} 个词。</p>
        <button type="button" className="btn btn-primary" onClick={onExit}>
          回到生词列表
        </button>
      </div>
    )
  }

  const next = async (mastered: boolean) => {
    await markReviewed(v, mastered)
    setReveal(false)
    setIndex((i) => i + 1)
  }

  return (
    <div className={`glass ${styles.review}`}>
      <div className={styles.reviewTop}>
        <span className="muted">
          第 {index + 1} / {round.length} 个
        </span>
        <button type="button" className={styles.linkBtn} onClick={onExit}>
          结束复习
        </button>
      </div>
      <button type="button" className={styles.bigWord} onClick={() => speak(v.display, { rate: 0.85 })}>
        {v.display}
      </button>
      <p className={styles.reviewContext}>
        <Context text={v.context} word={v.display} />
      </p>
      {reveal ? (
        <p className={styles.reviewZh}>{v.contextZh || '这句话没有保存中文。'}</p>
      ) : (
        <button type="button" className="btn" onClick={() => setReveal(true)}>
          看中文
        </button>
      )}
      <div className={styles.reviewActions}>
        <button type="button" className="btn" onClick={() => speak(v.context)}>
          听例句
        </button>
        <span className={styles.spacer} />
        <button type="button" className="btn" onClick={() => next(false)}>
          还不熟
        </button>
        <button type="button" className="btn btn-primary" onClick={() => next(true)}>
          记住了
        </button>
      </div>
    </div>
  )
}

function VocabRow({ v }: { v: VocabItem }) {
  const [confirming, setConfirming] = useState(false)
  const lesson = v.lessonId ? getLesson(v.lessonId) : undefined
  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <button type="button" className={styles.word} onClick={() => speak(v.display, { rate: 0.85 })} title="点击发音">
          {v.display}
        </button>
        {v.mastered && <span className="chip">已掌握</span>}
      </div>
      <p className={styles.context}>
        <Context text={v.context} word={v.display} />
      </p>
      {v.contextZh && <p className={styles.contextZh}>{v.contextZh}</p>}
      <div className={styles.itemFoot}>
        <span className="muted">
          {dayLabel(v.addedAt)}加入{lesson ? `，来自《${lesson.titleZh}》` : ''}
          {v.reviewCount > 0 ? `，复习过 ${v.reviewCount} 次` : ''}
        </span>
        <div className={styles.itemActions}>
          <button type="button" className={styles.linkBtn} onClick={() => speak(v.context)}>
            听例句
          </button>
          <button type="button" className={styles.linkBtn} onClick={() => updateVocab({ ...v, mastered: !v.mastered })}>
            {v.mastered ? '移回待复习' : '标为已掌握'}
          </button>
          {confirming ? (
            <>
              <button type="button" className={`${styles.linkBtn} ${styles.danger}`} onClick={() => deleteVocab(v.word)}>
                确认删除
              </button>
              <button type="button" className={styles.linkBtn} onClick={() => setConfirming(false)}>
                取消
              </button>
            </>
          ) : (
            <button type="button" className={styles.linkBtn} onClick={() => setConfirming(true)}>
              删除
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

export default function VocabPage() {
  const { data, loading } = useLiveData(listVocab, ['vocab'])
  const [filter, setFilter] = useState<Filter>('review')
  const [reviewing, setReviewing] = useState(false)
  const all = useMemo(() => data ?? [], [data])
  const toReview = all.filter((v) => !v.mastered)
  const mastered = all.length - toReview.length
  const shown = filter === 'all' ? all : filter === 'mastered' ? all.filter((v) => v.mastered) : toReview

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'review', label: '待复习', count: toReview.length },
    { id: 'mastered', label: '已掌握', count: mastered },
    { id: 'all', label: '全部', count: all.length },
  ]

  return (
    <AppShell>
      <div className={styles.head}>
        <h1 className={styles.heading}>生词本</h1>
        {!reviewing && toReview.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => setReviewing(true)}>
            复习 {toReview.length} 个词
          </button>
        )}
      </div>

      {loading ? null : reviewing ? (
        <ReviewCard queue={toReview} onExit={() => setReviewing(false)} />
      ) : all.length === 0 ? (
        <div className={`glass ${styles.empty}`}>
          <p>生词本还是空的。跟读时用手指捏一下屏幕上的词，或者在练习结果页点“加入生词本”，词会连同原句一起存到这里。</p>
          <Link className="btn btn-primary" to="/shadowing">
            去跟读
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.tabs} role="tablist" aria-label="筛选生词">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={filter === t.id}
                className={`${styles.tab} ${filter === t.id ? styles.tabActive : ''}`}
                onClick={() => setFilter(t.id)}
              >
                {t.label} <span className={styles.count}>{t.count}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className={styles.note}>
              {filter === 'review' ? '所有生词都掌握了。下次跟读时再收集新的词吧。' : '还没有标为已掌握的词。'}
            </p>
          ) : (
            <ul className={styles.grid}>
              {shown.map((v) => (
                <VocabRow key={v.word} v={v} />
              ))}
            </ul>
          )}
        </>
      )}
    </AppShell>
  )
}
