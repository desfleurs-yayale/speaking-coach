// /shadowing/session/:lessonId — loads the lesson (built-in or custom), then runs the full-screen session.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { listCustomLessons } from '../../lib/db'
import type { Lesson } from '../../lib/types'
import { getLesson } from '../../lessons'
import { Session } from './Session'
import styles from './Session.module.css'

type Loaded = { id: string; lesson: Lesson | null }

export default function SessionPage() {
  const { lessonId = '' } = useParams()
  const builtIn = getLesson(lessonId)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (builtIn) return
    let alive = true
    listCustomLessons()
      .then((all) => all.find((l) => l.id === lessonId) ?? null)
      .catch(() => null)
      .then((lesson) => {
        if (alive) setLoaded({ id: lessonId, lesson })
      })
    return () => {
      alive = false
    }
  }, [builtIn, lessonId])

  const lesson = builtIn ?? (loaded?.id === lessonId ? loaded.lesson : undefined)
  if (lesson === undefined) {
    return (
      <div className={styles.center}>
        <div className="dream-backdrop" />
        <p className="dream-title" style={{ fontSize: 28 }}>
          loading the dream…
        </p>
      </div>
    )
  }
  if (!lesson || !lesson.sentences.length) {
    return (
      <div className={styles.center}>
        <div className="dream-backdrop" />
        <div className={`glass ${styles.panel}`}>
          <h2>{lesson ? '这个内容还没有句子' : '找不到这个练习内容'}</h2>
          <p className="muted">它可能已被删除。回到列表选择其他内容吧。</p>
          <Link className="btn btn-primary" to="/shadowing">
            选择内容
          </Link>
        </div>
      </div>
    )
  }
  return <Session key={lesson.id} lesson={lesson} />
}
