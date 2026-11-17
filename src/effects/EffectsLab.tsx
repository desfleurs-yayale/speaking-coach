import { useEffect, useRef, useState } from 'react'
import { useCamera } from '../lib/camera'
import { DREAM_CARDS, DREAM_SCENES } from '../lib/dreamAssets'
import type { BackgroundMode, DreamStageHandle, StageStatus } from './types'
import { DreamStage } from './DreamStage'

const initialStatus: StageStatus = { phase: 'idle', segmentation: false, hands: false, fps: 0 }

export default function EffectsLab() {
  const camera = useCamera({ audio: false })
  const stageRef = useRef<DreamStageHandle | null>(null)
  const [scene, setScene] = useState(DREAM_SCENES[0].id)
  const [mode, setMode] = useState<BackgroundMode>('on')
  const [showHands, setShowHands] = useState(true)
  const [grain, setGrain] = useState(true)
  const [sparkles, setSparkles] = useState(true)
  const [status, setStatus] = useState(initialStatus)
  const [gesture, setGesture] = useState('none')
  const [recording, setRecording] = useState(false)
  const [recordUrl, setRecordUrl] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (recordUrl) URL.revokeObjectURL(recordUrl)
    },
    [recordUrl],
  )
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const removePinch = stage.onPinch((event) => {
      setGesture(`pinch ${event.hand} ${event.phase}`)
      if (event.phase === 'start')
        stage.showCard({
          src: DREAM_CARDS[Math.floor(Math.random() * DREAM_CARDS.length)],
          x: event.x,
          y: event.y,
          durationMs: 6000,
        })
    })
    const removeGesture = stage.onGesture((event) => setGesture(event))
    return () => {
      removePinch()
      removeGesture()
    }
  }, [status.phase])

  const record = () => {
    const stage = stageRef.current
    if (!stage || !('MediaRecorder' in window)) return
    const capture = stage.captureStream(30)
    const chunks: Blob[] = []
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(capture, { mimeType: 'video/webm;codecs=vp9' })
    } catch {
      recorder = new MediaRecorder(capture)
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }))
      setRecordUrl(url)
      setRecording(false)
      capture.getTracks().forEach((track) => track.stop())
    }
    setRecordUrl(null)
    setRecording(true)
    recorder.start()
    window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), 5000)
  }

  const subtitleRenderer = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.font = `${Math.max(18, width * 0.022)}px Avenir Next, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,.96)'
    ctx.shadowColor = 'rgba(25,55,120,.65)'
    ctx.shadowBlur = 10
    ctx.fillText('I am learning to speak with confidence.', width / 2, height * 0.84)
    ctx.restore()
  }

  return (
    <main
      style={{
        height: '100%',
        minHeight: '100vh',
        background: '#132b55',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <DreamStage
        stream={camera.stream}
        scene={scene}
        backgroundMode={mode}
        showHands={showHands}
        grain={grain}
        ambientSparkles={sparkles}
        onReady={(handle) => {
          stageRef.current = handle
          handle.setOverlayRenderer(subtitleRenderer)
        }}
        onStatus={setStatus}
        style={{ width: '100%', height: '100vh' }}
      />
      <div
        onClick={(event) => {
          const stage = stageRef.current
          if (!stage || (event.target as HTMLElement).closest('button,select,input,a')) return
          const p = stage.toStage(event.clientX, event.clientY)
          stage.burst({ x: p.x, y: p.y })
        }}
        style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
      />
      <section
        className="glass"
        style={{
          position: 'absolute',
          top: 18,
          left: 18,
          width: 280,
          padding: 16,
          color: '#142a51',
          background: 'rgba(245,249,255,.72)',
        }}
      >
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}
        >
          <strong>Dream Stage Lab</strong>
          <span className="chip">{status.phase}</span>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (camera.stream) camera.stop()
              else void camera.start()
            }}
          >
            {camera.stream ? '停止摄像头' : '打开摄像头'}
          </button>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            场景
            <select
              value={scene}
              onChange={(e) => {
                const value = e.target.value as typeof scene
                setScene(value)
                stageRef.current?.setScene(value)
              }}
            >
              <option value="sky">晴空</option>
              {DREAM_SCENES.slice(1).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            背景模式
            <select value={mode} onChange={(e) => setMode(e.target.value as BackgroundMode)}>
              <option value="off">关闭</option>
              <option value="on">常开</option>
              <option value="gesture">手势触发</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
            <label>
              <input type="checkbox" checked={showHands} onChange={(e) => setShowHands(e.target.checked)} />{' '}
              手部
            </label>
            <label>
              <input type="checkbox" checked={grain} onChange={(e) => setGrain(e.target.checked)} /> 胶片
            </label>
            <label>
              <input type="checkbox" checked={sparkles} onChange={(e) => setSparkles(e.target.checked)} />{' '}
              闪烁
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button className="btn" onClick={() => stageRef.current?.burst({ x: 0.5, y: 0.5 })}>
              Burst
            </button>
            <button className="btn" onClick={() => stageRef.current?.fountain({ x: 0.5 })}>
              Fountain
            </button>
            <button className="btn" onClick={() => stageRef.current?.flyBirds(7)}>
              Birds
            </button>
            <button
              className="btn"
              onClick={() => stageRef.current?.showCard({ src: DREAM_CARDS[0], x: 0.76, y: 0.3 })}
            >
              Card
            </button>
            <button className="btn" onClick={() => stageRef.current?.clearCards()}>
              清除卡片
            </button>
            <button className="btn" disabled={recording} onClick={record}>
              {recording ? '录制中…' : '录制 5 秒'}
            </button>
          </div>
          {recordUrl && (
            <a className="btn" href={recordUrl} download="dream-stage.webm">
              下载录制
            </a>
          )}
        </div>
        <div
          style={{
            marginTop: 12,
            borderTop: '1px solid rgba(40,70,120,.18)',
            paddingTop: 10,
            fontSize: 11,
            lineHeight: 1.7,
          }}
        >
          <div>
            fps {status.fps} · 分割 {status.segmentation ? 'on' : 'off'} · 手 {status.hands ? 'on' : 'off'}
          </div>
          <div>gesture: {gesture}</div>
          {status.error && <div style={{ color: '#ab3258' }}>{status.error}</div>}
          {camera.error && <div style={{ color: '#ab3258' }}>{camera.error}</div>}
        </div>
      </section>
    </main>
  )
}
