// Full-screen camera session: DreamStage + canvas subtitles + glass controls. No AppShell here.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DreamStage, type BackgroundMode, type DreamStageHandle } from '../../effects'
import { useCamera } from '../../lib/camera'
import type { Lesson } from '../../lib/types'
import { LEVEL_NAMES } from '../../lessons'
import { ShadowingController, type SessionEvent } from './controller'
import styles from './Session.module.css'

const BG_MODES: { id: BackgroundMode; label: string }[] = [
  { id: 'gesture', label: '手势' },
  { id: 'on', label: '常开' },
  { id: 'off', label: '关' },
]

function formatClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className={styles.clock}>{formatClock(now - since)}</span>
}

export function Session({ lesson }: { lesson: Lesson }) {
  const navigate = useNavigate()
  const camera = useCamera({ audio: true })
  const stopCamera = camera.stop
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const [handsUp, setHandsUp] = useState(false)
  const [bgMode, setBgMode] = useState<BackgroundMode>('gesture')
  const [stage, setStage] = useState<DreamStageHandle | null>(null)
  const [stageError, setStageError] = useState<string | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  const [ctl] = useState(() => new ShadowingController(lesson))
  const subscribe = useCallback(
    (cb: () => void) =>
      ctl.on((e) => {
        if (e.type === 'changed') cb()
      }),
    [ctl],
  )
  useSyncExternalStore(subscribe, () => ctl.version)

  useEffect(() => {
    ctl.revive()
    return () => ctl.dispose()
  }, [ctl])

  useEffect(
    () =>
      ctl.on((e: SessionEvent) => {
        if (e.type === 'toast') setToast({ text: e.text, id: Date.now() })
        else if (e.type === 'hands-up') setHandsUp(true)
        else if (e.type === 'finished') {
          stopCamera()
          navigate(`/shadowing/result/${e.sessionId}`, { replace: true, state: { recordingFailed: e.recordingFailed } })
        }
      }),
    [ctl, navigate, stopCamera],
  )

  useEffect(() => (stage ? ctl.attachStage(stage) : undefined), [ctl, stage])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(id)
  }, [toast])

  const running = ctl.phase === 'running'

  const start = useCallback(async () => {
    const s = await camera.start()
    if (s) ctl.start(s)
  }, [camera, ctl])

  const finish = useCallback(() => void ctl.finish(), [ctl])

  const leave = () => {
    if (running && !window.confirm('现在离开，本次练习不会保存。确定离开吗？')) return
    navigate('/shadowing')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ctl.phase !== 'running' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const key = e.key
      if (key === ' ' || key === 'Backspace' || key === 'ArrowLeft' || key === 'ArrowRight') {
        e.preventDefault()
        ;(document.activeElement as HTMLElement | null)?.blur?.() // so a focused button does not also fire
      }
      if (key === 'r' || key === 'R') void ctl.listen()
      else if (key === 'Backspace') ctl.retry()
      else if (key === ' ' || key === 'ArrowRight') ctl.next()
      else if (key === 'ArrowLeft') ctl.prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctl])

  const onLayerClick = (e: MouseEvent<HTMLDivElement>) => {
    const index = ctl.wordAt(e.clientX, e.clientY)
    if (index !== null) void ctl.collect(index)
  }
  const onLayerMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = layerRef.current
    if (el) el.style.cursor = ctl.wordAt(e.clientX, e.clientY) !== null ? 'pointer' : ''
  }

  const rec = ctl.recState
  const recLabel = !ctl.recordWanted
    ? rec === 'paused'
      ? '已暂停'
      : '未录制'
    : rec === 'recording'
      ? 'REC'
      : rec === 'unsupported'
        ? '无法录制'
        : rec === 'error'
          ? '录制出错'
          : rec === 'paused'
            ? '已暂停'
            : '待录制'
  const notice =
    ctl.speechError ??
    (ctl.speaking ? '正在播放原句，识别已暂停…' : null) ??
    (running && ctl.speechSupported && ctl.speechState === 'starting' ? '正在打开语音识别…' : null)
  const last = ctl.index >= ctl.total - 1

  return (
    <div className={styles.root}>
      <DreamStage
        className={styles.stage}
        stream={camera.stream}
        scene={lesson.scene}
        backgroundMode={bgMode}
        onReady={setStage}
        onStatus={(s) => setStageError(s.error ?? null)}
      >
        <div ref={layerRef} className={styles.clickLayer} onClick={onLayerClick} onPointerMove={onLayerMove} />

        <header className={`glass ${styles.topBar}`}>
          <button className={styles.back} onClick={leave} aria-label="返回列表" title="返回列表">
            ‹
          </button>
          <div className={styles.titleBox}>
            <strong>{lesson.title}</strong>
            <span>{lesson.titleZh}</span>
          </div>
          <span className={styles.progress}>
            {ctl.index + 1} / {ctl.total}
          </span>
          {ctl.startedAt ? <Elapsed since={ctl.startedAt} /> : <span className={styles.clock}>0:00</span>}
          <span className={`${styles.rec} ${ctl.recordWanted && rec === 'recording' ? styles.recOn : ''}`}>
            <i />
            {recLabel}
          </span>
          <div className={styles.modes} role="group" aria-label="梦境背景">
            <span>梦境</span>
            {BG_MODES.map((m) => (
              <button
                key={m.id}
                className={bgMode === m.id ? styles.modeOn : ''}
                onClick={() => setBgMode(m.id)}
                aria-pressed={bgMode === m.id}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button className={`btn ${styles.endBtn}`} onClick={finish} disabled={!running}>
            结束
          </button>
        </header>

        {running && bgMode === 'gesture' && !handsUp && <div className={styles.hint}>举起双手，打开梦境 ☁️</div>}
        {running && (notice || stageError) && (
          <div className={styles.notices}>
            {notice && <div className={styles.notice}>{notice}</div>}
            {stageError && <div className={styles.notice}>{stageError}</div>}
          </div>
        )}

        {running && (
          <div className={`glass ${styles.controls}`}>
            <button className="btn" onClick={() => ctl.prev()} disabled={ctl.index === 0}>
              上一句 <kbd>←</kbd>
            </button>
            <button className="btn" onClick={() => void ctl.listen()} disabled={ctl.speaking}>
              听原句 <kbd>R</kbd>
            </button>
            <button className="btn" onClick={() => ctl.retry()}>
              重读 <kbd>⌫</kbd>
            </button>
            <button className="btn btn-primary" onClick={() => ctl.next()}>
              {last ? '完成' : '下一句'} <kbd>空格</kbd>
            </button>
            <button
              className={`btn ${styles.recToggle}`}
              onClick={() => ctl.setRecording(!ctl.recordWanted)}
              disabled={rec === 'unsupported'}
              aria-pressed={ctl.recordWanted}
            >
              {ctl.recordWanted ? '⏸ 暂停录制' : '⏺ 继续录制'}
            </button>
          </div>
        )}

        {toast && (
          <div key={toast.id} className={styles.toast}>
            {toast.text}
          </div>
        )}

        {ctl.phase === 'ready' && (
          <div className={styles.overlay}>
            <div className={`glass ${styles.panel}`}>
              <span className="chip">
                {LEVEL_NAMES[lesson.level]} · {lesson.sentences.length} 句
              </span>
              <h1 className={`dream-title ${styles.bigTitle}`}>{lesson.title}</h1>
              <p className={styles.zhTitle}>{lesson.titleZh}</p>
              <ul className={styles.steps}>
                <li>点击「开始跟读」，允许浏览器使用摄像头和麦克风。</li>
                <li>跟着字幕大声朗读，读对的单词会亮起金光；整句读完会自动进入下一句。</li>
                <li>举起双手打开梦境；捏合手指靠近单词，或直接点击单词，把它收进生词本。</li>
                <li>快捷键：R 听原句 · ⌫ 重读 · 空格 下一句 · ← 上一句</li>
              </ul>
              {!ctl.speechSupported && (
                <p className={styles.warn}>
                  当前浏览器不支持语音识别，单词无法自动点亮。请用电脑版 Chrome 打开本页。
                  你仍然可以开始，手动切换句子并录制视频。
                </p>
              )}
              {camera.error && <p className={styles.warn}>{camera.error}</p>}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={ctl.recordWanted}
                  onChange={(e) => ctl.setRecording(e.target.checked)}
                />
                录制这次跟读（视频只保存在本机浏览器里）
              </label>
              <div className={styles.row}>
                <button className="btn btn-primary" onClick={() => void start()} disabled={camera.starting}>
                  {camera.starting ? '正在打开摄像头…' : '开始跟读'}
                </button>
                <Link className="btn btn-ghost" to="/shadowing">
                  返回
                </Link>
              </div>
            </div>
          </div>
        )}

        {ctl.phase === 'ending' && (
          <div className={styles.overlay}>
            <div className={`glass ${styles.panel}`}>
              <p className={`dream-title ${styles.saving}`}>saving the dream…</p>
              <p>正在保存成绩和录像，请稍等。</p>
            </div>
          </div>
        )}

        {ctl.phase === 'failed' && (
          <div className={styles.overlay}>
            <div className={`glass ${styles.panel}`}>
              <h2>保存失败</h2>
              <p className={styles.warn}>{ctl.failure}</p>
              <Link className="btn btn-primary" to="/shadowing">
                返回列表
              </Link>
            </div>
          </div>
        )}
      </DreamStage>
    </div>
  )
}
