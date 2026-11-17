// /shadowing — built-in lessons filtered by theme and level, plus the user's pasted lessons.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../../components/AppShell'
import { deleteCustomLesson, listCustomLessons, onDataChanged } from '../../lib/db'
import { getScene } from '../../lib/dreamAssets'
import type { Lesson, LessonLevel, LessonTheme } from '../../lib/types'
import { LESSONS, LEVEL_NAMES, THEMES } from '../../lessons'
import { CustomLessonForm } from './CustomLessonForm'
import styles from './Picker.module.css'

const LEVELS: LessonLevel[] = [1, 2, 3]

function LessonCard({ lesson, onDelete }: { lesson: Lesson; onDelete?: () => void }) {
  const scene = getScene(lesson.scene)
  const theme = THEMES.find((t) => t.id === lesson.theme)
  return (
    <div className={`glass ${styles.card}`}>
      <Link to={`/shadowing/session/${encodeURIComponent(lesson.id)}`} className={styles.cardLink}>
        <div
          className={styles.thumb}
          style={{ background: `url('${scene.src}') center / cover no-repeat, ${scene.fallback}` }}
          aria-hidden
        >
          <span className={styles.sceneName}>{scene.name}</span>
        </div>
        <div className={styles.cardBody}>
          <h3 lang="en">{lesson.title}</h3>
          <p className={styles.titleZh}>{lesson.titleZh}</p>
          <p className={styles.desc}>{lesson.description}</p>
          <div className={styles.meta}>
            <span className="chip">{LEVEL_NAMES[lesson.level]}</span>
            <span className="chip">{lesson.sentences.length} 句</span>
            {!lesson.custom && theme && (
              <span className="chip">
                {theme.emoji} {theme.name}
              </span>
            )}
          </div>
        </div>
      </Link>
      {onDelete && (
        <button className={styles.delete} onClick={onDelete} aria-label={`删除 ${lesson.title}`} title="删除">
          ✕
        </button>
      )}
    </div>
  )
}

export default function LessonPicker() {
  const [theme, setTheme] = useState<LessonTheme | 'all'>('all')
  const [level, setLevel] = useState<LessonLevel | 'all'>('all')
  const [custom, setCustom] = useState<Lesson[]>([])
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () =>
      listCustomLessons()
        .then((all) => {
          if (alive) setCustom(all.sort((a, b) => b.id.localeCompare(a.id)))
        })
        .catch(() => alive && setLoadError(true))
    void load()
    const off = onDataChanged((store) => {
      if (store === 'customLessons') void load()
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  const filtered = useMemo(
    () => LESSONS.filter((l) => (theme === 'all' || l.theme === theme) && (level === 'all' || l.level === level)),
    [theme, level],
  )
  const groups = useMemo(
    () =>
      THEMES.filter((t) => theme === 'all' || t.id === theme)
        .map((t) => ({ theme: t, lessons: filtered.filter((l) => l.theme === t.id) }))
        .filter((g) => g.lessons.length),
    [filtered, theme],
  )

  const remove = async (l: Lesson) => {
    if (!window.confirm(`删除「${l.title}」？删除后无法恢复。`)) return
    await deleteCustomLesson(l.id).catch(() => window.alert('删除失败，请稍后再试。'))
  }

  return (
    <AppShell wide>
      <section className={styles.hero}>
        <h1 className="dream-title">Shadowing</h1>
        <p>选一段内容，打开摄像头，跟着字幕大声读出来。读对的每个单词都会在梦境里闪闪发光。</p>
      </section>

      <div className={`glass ${styles.filters}`}>
        <div className={styles.chipRow} role="group" aria-label="主题">
          <button className={`${styles.filter} ${theme === 'all' ? styles.filterOn : ''}`} onClick={() => setTheme('all')}>
            ✦ 全部主题
          </button>
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`${styles.filter} ${theme === t.id ? styles.filterOn : ''}`}
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
            >
              {t.emoji} {t.name}
            </button>
          ))}
        </div>
        <div className={styles.chipRow} role="group" aria-label="等级">
          <button className={`${styles.filter} ${level === 'all' ? styles.filterOn : ''}`} onClick={() => setLevel('all')}>
            全部等级
          </button>
          {LEVELS.map((lv) => (
            <button
              key={lv}
              className={`${styles.filter} ${level === lv ? styles.filterOn : ''}`}
              onClick={() => setLevel(lv)}
              aria-pressed={level === lv}
            >
              {'✦'.repeat(lv)} {LEVEL_NAMES[lv]}
            </button>
          ))}
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>✎ 自定义内容</h2>
          {!showForm && (
            <button className="btn" onClick={() => setShowForm(true)}>
              ＋ 粘贴我的内容
            </button>
          )}
        </div>
        {showForm && <CustomLessonForm onSaved={() => setShowForm(false)} onCancel={() => setShowForm(false)} />}
        {loadError && <p className={styles.error}>读取自定义内容失败（浏览器可能禁用了本地存储）。</p>}
        {custom.length > 0 ? (
          <div className={styles.grid}>
            {custom.map((l) => (
              <LessonCard key={l.id} lesson={l} onDelete={() => void remove(l)} />
            ))}
          </div>
        ) : (
          !showForm && <p className={styles.empty}>还没有自定义内容。粘贴歌词、台词或课文，就能用它来跟读。</p>
        )}
      </section>

      {groups.map((g) => (
        <section key={g.theme.id} className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>
              {g.theme.emoji} {g.theme.name}
            </h2>
            <span className={styles.count}>{g.lessons.length} 课</span>
          </div>
          <div className={styles.grid}>
            {g.lessons.map((l) => (
              <LessonCard key={l.id} lesson={l} />
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <p className={styles.empty}>这个筛选条件下没有内容，换个主题或等级试试。</p>}
    </AppShell>
  )
}
