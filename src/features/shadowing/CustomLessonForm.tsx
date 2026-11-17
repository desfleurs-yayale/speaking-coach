// Form for pasted lessons: English lines (optionally each followed by its Chinese line), or a paragraph.
import { useMemo, useState, type FormEvent } from 'react'
import { newId, saveCustomLesson } from '../../lib/db'
import { DREAM_SCENES, getScene } from '../../lib/dreamAssets'
import type { DreamSceneId, Lesson } from '../../lib/types'
import { estimateLevel, MAX_SENTENCES, parseCustomText } from './customText'
import styles from './Picker.module.css'

const PLACEHOLDER = `每行一句英文，下一行可以写它的中文翻译（可选）：

Good morning! How did you sleep?
早上好！你睡得怎么样？
I slept well, thank you.
我睡得很好，谢谢。

也可以直接粘贴一整段英文，会自动拆成句子。`

export function CustomLessonForm({ onSaved, onCancel }: { onSaved: (l: Lesson) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [scene, setScene] = useState<DreamSceneId>('sky')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sentences = useMemo(() => parseCustomText(text), [text])
  const translated = sentences.filter((s) => s.zh).length

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('给这份内容起个标题吧。')
    if (!sentences.length) return setError('没有找到英文句子，请粘贴英文内容。')
    const lesson: Lesson = {
      id: newId('custom-'),
      title: title.trim().slice(0, 60),
      titleZh: '自定义内容',
      theme: 'daily',
      level: estimateLevel(sentences),
      scene,
      description: `我粘贴的内容 · ${sentences.length} 句${translated ? ` · ${translated} 句带中文` : ''}`,
      sentences,
      custom: true,
    }
    setSaving(true)
    setError(null)
    try {
      await saveCustomLesson(lesson)
      onSaved(lesson)
    } catch (err) {
      setError(`保存失败：${err instanceof Error ? err.message : String(err)}`)
      setSaving(false)
    }
  }

  return (
    <form className={`glass ${styles.form}`} onSubmit={(e) => void submit(e)}>
      <h3>添加自定义内容</h3>
      <label className={styles.field}>
        <span>标题</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：My Favorite Song" maxLength={60} />
      </label>
      <label className={styles.field}>
        <span>英文内容</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={PLACEHOLDER} rows={10} spellCheck={false} />
      </label>
      <div className={styles.field}>
        <span>梦境场景</span>
        <div className={styles.scenes}>
          {DREAM_SCENES.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`${styles.sceneOpt} ${scene === s.id ? styles.sceneOn : ''}`}
              style={{ background: `url('${s.src}') center / cover no-repeat, ${s.fallback}` }}
              onClick={() => setScene(s.id)}
              aria-pressed={scene === s.id}
            >
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      {sentences.length > 0 && (
        <div className={styles.preview}>
          <p className="muted">
            识别出 {sentences.length} 句{translated ? `，其中 ${translated} 句带中文` : ''}
            {sentences.length >= MAX_SENTENCES ? `（最多 ${MAX_SENTENCES} 句）` : ''}，场景：{getScene(scene).name}
          </p>
          <ol>
            {sentences.slice(0, 6).map((s) => (
              <li key={s.id}>
                <span lang="en">{s.text}</span>
                {s.zh && <small>{s.zh}</small>}
              </li>
            ))}
          </ol>
          {sentences.length > 6 && <p className="muted">…还有 {sentences.length - 6} 句</p>}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.formRow}>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  )
}
