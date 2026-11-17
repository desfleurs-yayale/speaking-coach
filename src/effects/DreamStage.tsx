// TEMPORARY STUB of the effects engine so other features can run before the real engine lands.
// It draws the mirrored camera onto a canvas and implements the handle with minimal behaviour.
// The "effects" child replaces this file (or re-exports its real implementation from here).

import { useEffect, useMemo, useRef } from 'react'
import { getScene } from '../lib/dreamAssets'
import type { DreamStageHandle, DreamStageProps, OverlayRenderer } from './types'

export function DreamStage(props: DreamStageProps) {
  const { stream, scene, mirrored = true, className, style, children, onReady, onStatus } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<OverlayRenderer | null>(null)

  const handle = useMemo<DreamStageHandle>(() => {
    const rect = () => wrapRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1)
    return {
      burst: () => {},
      fountain: () => {},
      flyBirds: () => {},
      showCard: () => {},
      clearCards: () => {},
      setScene: () => {},
      setBackgroundActive: () => {},
      getHands: () => [],
      onPinch: () => () => {},
      onGesture: () => () => {},
      setOverlayRenderer: (fn) => {
        overlayRef.current = fn
      },
      toStage: (cx, cy) => {
        const r = rect()
        return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height }
      },
      fromStage: (p) => {
        const r = rect()
        return { clientX: r.left + p.x * r.width, clientY: r.top + p.y * r.height }
      },
      captureStream: (fps = 30) => canvasRef.current!.captureStream(fps),
      getCanvas: () => canvasRef.current,
    }
  }, [])

  useEffect(() => {
    onReady?.(handle)
    onStatus?.({ phase: 'running', segmentation: false, hands: false, fps: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.srcObject = stream
    if (stream) v.play().catch(() => {})
  }, [stream])

  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = canvasRef.current
      const wrap = wrapRef.current
      const v = videoRef.current
      if (!c || !wrap) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(wrap.clientWidth * dpr)
      const h = Math.round(wrap.clientHeight * dpr)
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#8fb8f2'
      ctx.fillRect(0, 0, w, h)
      if (v && v.readyState >= 2 && v.videoWidth) {
        // cover-fit
        const s = Math.max(w / v.videoWidth, h / v.videoHeight)
        const dw = v.videoWidth * s
        const dh = v.videoHeight * s
        ctx.save()
        if (mirrored) {
          ctx.translate(w, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh)
        ctx.restore()
      }
      overlayRef.current?.(ctx, w, h, performance.now())
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [mirrored])

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', background: getScene(scene).fallback, ...style }}
    >
      <video ref={videoRef} muted playsInline style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
    </div>
  )
}
