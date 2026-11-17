import { useEffect, useMemo, useRef } from 'react'
import {
  FilesetResolver,
  HandLandmarker,
  ImageSegmenter,
  type HandLandmarkerResult,
  type ImageSegmenterResult,
} from '@mediapipe/tasks-vision'
import { getScene, MEDIAPIPE } from '../lib/dreamAssets'
import type {
  BackgroundMode,
  BurstOptions,
  CardOptions,
  DreamStageHandle,
  DreamStageProps,
  FountainOptions,
  HandPoint,
  OverlayRenderer,
  PinchEvent,
  StageStatus,
  TrackedHand,
} from './types'

const TAU = Math.PI * 2
const CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
] as const
type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  twinkle: number
  gravity: number
  star: boolean
}
type Bird = { x: number; y: number; speed: number; size: number; phase: number; life: number }
type Card = {
  src: string
  x: number
  y: number
  w: number
  born: number
  duration: number
  angle: number
  seed: number
  image?: HTMLImageElement
  failed?: boolean
}
function clamp(v: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v))
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
function hash(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
function drawFallback(ctx: CanvasRenderingContext2D, css: string, w: number, h: number) {
  const colors = [...css.matchAll(/#[0-9a-f]{3,8}/gi)].map((m) => m[0])
  if (colors.length > 1) {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c))
    ctx.fillStyle = g
  } else ctx.fillStyle = colors[0] ?? '#79a8e8'
  ctx.fillRect(0, 0, w, h)
}
function coverRect(sourceW: number, sourceH: number, w: number, h: number) {
  const scale = Math.max(w / sourceW, h / sourceH)
  const dw = sourceW * scale,
    dh = sourceH * scale
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh }
}
function isOpenPalm(points: HandPoint[]) {
  if (points.length < 21) return false
  const wrist = points[0]
  return [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ].every(
    ([tip, pip]) =>
      Math.hypot(points[tip].x - wrist.x, points[tip].y - wrist.y) >
      Math.hypot(points[pip].x - wrist.x, points[pip].y - wrist.y) * 1.08,
  )
}

export function DreamStage(props: DreamStageProps) {
  const {
    stream,
    scene: sceneProp,
    backgroundMode = 'on',
    mirrored = true,
    showHands = true,
    grain = true,
    ambientSparkles = true,
    className,
    style,
    children,
    onReady,
    onStatus,
  } = props
  const wrapRef = useRef<HTMLDivElement>(null),
    canvasRef = useRef<HTMLCanvasElement>(null),
    videoRef = useRef<HTMLVideoElement>(null)
  const sceneRef = useRef(sceneProp),
    modeRef = useRef<BackgroundMode>(backgroundMode),
    manualBackgroundRef = useRef<boolean | null>(null),
    activeMixRef = useRef(backgroundMode === 'on' ? 1 : 0),
    bgTargetRef = useRef(backgroundMode === 'on' ? 1 : 0)
  const sceneImageRef = useRef<HTMLImageElement | null>(null),
    previousSceneImageRef = useRef<HTMLImageElement | null>(null),
    sceneFadeAtRef = useRef(0),
    sceneLoadedRef = useRef(false),
    segmentationFailedRef = useRef(false),
    overlayRef = useRef<OverlayRenderer | null>(null)
  const particlesRef = useRef<Particle[]>([]),
    birdsRef = useRef<Bird[]>([]),
    cardsRef = useRef<Card[]>([]),
    handsRef = useRef<TrackedHand[]>([]),
    pinchStateRef = useRef(new Map<'Left' | 'Right', boolean>())
  const pinchListenersRef = useRef(new Set<(e: PinchEvent) => void>()),
    gestureListenersRef = useRef(new Set<(g: 'hands-up' | 'hands-down') => void>()),
    statusRef = useRef<StageStatus>({ phase: 'idle', segmentation: false, hands: false, fps: 0 }),
    onStatusRef = useRef(onStatus),
    reducedMotionRef = useRef(false)
  onStatusRef.current = onStatus
  const handle = useMemo<DreamStageHandle>(
    () => ({
      burst(opts: BurstOptions) {
        const count = Math.min(opts.count ?? 40, reducedMotionRef.current ? 18 : 90),
          spread = opts.spread ?? 0.04,
          color = opts.color ?? getScene(sceneRef.current).particle
        for (let i = 0; i < count; i += 1) {
          const angle = hash(i * 4.1 + performance.now()) * TAU,
            speed = 0.00012 + hash(i * 2.7 + 11) * 0.00028
          particlesRef.current.push({
            x: clamp(opts.x + (hash(i + 2) - 0.5) * spread),
            y: clamp(opts.y + (hash(i + 7) - 0.5) * spread),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.00012,
            life: 0,
            maxLife: 500 + hash(i + 30) * 500,
            size: 1.2 + hash(i + 10) * 3.5,
            color,
            twinkle: hash(i + 40) * TAU,
            gravity: 0,
            star: i % 3 === 0,
          })
        }
      },
      fountain(opts: FountainOptions) {
        const count = reducedMotionRef.current ? 55 : 150,
          duration = opts.durationMs ?? 1600,
          width = opts.width ?? 0.15,
          color = opts.color ?? getScene(sceneRef.current).particle
        for (let i = 0; i < count; i += 1)
          particlesRef.current.push({
            x: clamp(opts.x + (hash(i + 1) - 0.5) * width),
            y: 1.02,
            vx: (hash(i + 2) - 0.5) * 0.00045,
            vy: -(0.0005 + hash(i + 4) * 0.0014),
            life: hash(i * 3.9 + performance.now()) * 250,
            maxLife: duration * (0.75 + hash(i + 8) * 0.5),
            size: 1 + hash(i + 20) * 3,
            color,
            twinkle: hash(i + 25) * TAU,
            gravity: 0.0000012,
            star: i % 4 === 0,
          })
      },
      flyBirds(count = 5) {
        for (let i = 0; i < Math.min(count, 20); i += 1)
          birdsRef.current.push({
            x: -0.12 - hash(i) * 0.1,
            y: 0.1 + hash(i + 2) * 0.25,
            speed: 0.00012 + hash(i + 3) * 0.00015,
            size: 0.012 + hash(i + 4) * 0.013,
            phase: hash(i + 5) * TAU,
            life: 0,
          })
      },
      showCard(opts: CardOptions) {
        const image = new Image()
        image.decoding = 'async'
        const card: Card = {
          src: opts.src,
          x: clamp(opts.x),
          y: clamp(opts.y),
          w: opts.widthRatio ?? 0.16,
          born: performance.now(),
          duration: opts.durationMs ?? 6000,
          angle: (hash(opts.x * 100 + opts.y * 10) - 0.5) * 0.16,
          seed: hash(opts.x + opts.y),
        }
        image.onload = () => {
          card.image = image
        }
        image.onerror = () => {
          card.failed = true
        }
        image.src = opts.src
        cardsRef.current.push(card)
        if (cardsRef.current.length > 24) cardsRef.current.splice(0, cardsRef.current.length - 24)
      },
      clearCards() {
        cardsRef.current.length = 0
      },
      setScene(id) {
        if (id === sceneRef.current) return
        previousSceneImageRef.current = sceneImageRef.current
        sceneFadeAtRef.current = performance.now()
        sceneRef.current = id
        sceneLoadedRef.current = false
        const image = new Image()
        image.onload = () => {
          if (sceneRef.current === id) {
            sceneImageRef.current = image
            sceneLoadedRef.current = true
          }
        }
        image.onerror = () => {
          if (sceneRef.current === id) {
            sceneImageRef.current = null
            sceneLoadedRef.current = false
          }
        }
        image.src = getScene(id).src
      },
      setBackgroundActive(active) {
        manualBackgroundRef.current = active
        bgTargetRef.current = active ? 1 : 0
      },
      getHands() {
        return handsRef.current.map((h) => ({
          ...h,
          landmarks: h.landmarks.map((p) => ({ ...p })),
          pinchPoint: { ...h.pinchPoint },
        }))
      },
      onPinch(cb) {
        pinchListenersRef.current.add(cb)
        return () => pinchListenersRef.current.delete(cb)
      },
      onGesture(cb) {
        gestureListenersRef.current.add(cb)
        return () => gestureListenersRef.current.delete(cb)
      },
      setOverlayRenderer(fn) {
        overlayRef.current = fn
      },
      toStage(clientX, clientY) {
        const r = wrapRef.current?.getBoundingClientRect()
        return !r || !r.width || !r.height
          ? { x: 0, y: 0 }
          : { x: clamp((clientX - r.left) / r.width), y: clamp((clientY - r.top) / r.height) }
      },
      fromStage(p) {
        const r = wrapRef.current?.getBoundingClientRect()
        return !r
          ? { clientX: p.x, clientY: p.y }
          : { clientX: r.left + p.x * r.width, clientY: r.top + p.y * r.height }
      },
      captureStream(fps = 30) {
        const canvas = canvasRef.current
        if (!canvas?.captureStream) throw new Error('Canvas captureStream is unavailable')
        return canvas.captureStream(fps)
      },
      getCanvas() {
        return canvasRef.current
      },
    }),
    [],
  )
  useEffect(() => {
    modeRef.current = backgroundMode
    if (manualBackgroundRef.current === null) bgTargetRef.current = backgroundMode === 'on' ? 1 : 0
  }, [backgroundMode])
  useEffect(() => {
    if (sceneProp !== sceneRef.current) {
      previousSceneImageRef.current = sceneImageRef.current
      sceneFadeAtRef.current = performance.now()
      sceneRef.current = sceneProp
    }
    sceneImageRef.current = null
    sceneLoadedRef.current = false
    const image = new Image()
    image.onload = () => {
      if (sceneRef.current === sceneProp) {
        sceneImageRef.current = image
        sceneLoadedRef.current = true
      }
    }
    image.src = getScene(sceneProp).src
  }, [sceneProp])
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = mq.matches
    const listener = () => {
      reducedMotionRef.current = mq.matches
    }
    mq.addEventListener?.('change', listener)
    return () => mq.removeEventListener?.('change', listener)
  }, [])
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    if (stream) video.play().catch(() => {})
    else video.pause()
    return () => {
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [stream])
  useEffect(() => {
    const canvas = canvasRef.current,
      wrap = wrapRef.current,
      video = videoRef.current
    if (!canvas || !wrap || !video) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    const handsStore = handsRef.current,
      particlesStore = particlesRef.current,
      birdsStore = birdsRef.current,
      cardsStore = cardsRef.current
    const maskCanvas = document.createElement('canvas'),
      maskCtx = maskCanvas.getContext('2d'),
      softMask = document.createElement('canvas'),
      softMaskCtx = softMask.getContext('2d'),
      personCanvas = document.createElement('canvas')
    const grainTile = document.createElement('canvas')
    grainTile.width = 128
    grainTile.height = 128
    const grainTileCtx = grainTile.getContext('2d')
    if (grainTileCtx) {
      grainTileCtx.fillStyle = 'rgba(255,255,255,.8)'
      for (let i = 0; i < 2600; i += 1) grainTileCtx.fillRect(Math.random() * 128, Math.random() * 128, 1, 1)
    }
    const grainPattern = ctx.createPattern(grainTile, 'repeat')
    let raf = 0,
      previous = performance.now(),
      fpsAt = previous,
      frames = 0,
      lastSegmentAt = 0,
      lastHandAt = 0,
      hasMask = false,
      disposed = false
    let hand: HandLandmarker | null = null,
      segmenter: ImageSegmenter | null = null,
      handsUpAt = 0,
      handsDownAt = 0,
      gestureUp = false
    const setStatus = (patch: Partial<StageStatus>) => {
      statusRef.current = { ...statusRef.current, ...patch }
      onStatusRef.current?.(statusRef.current)
    }
    const load = async () => {
      setStatus({ phase: 'loading-models', error: undefined })
      try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE.wasmBase)
        const make = (delegate: 'GPU' | 'CPU') =>
          Promise.all([
            HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: MEDIAPIPE.handModel, delegate },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.45,
              minHandPresenceConfidence: 0.45,
              minTrackingConfidence: 0.45,
            }),
            ImageSegmenter.createFromOptions(vision, {
              baseOptions: { modelAssetPath: MEDIAPIPE.segmenterModel, delegate },
              runningMode: 'VIDEO',
              outputConfidenceMasks: true,
            }),
          ])
        try {
          ;[hand, segmenter] = await make('GPU')
        } catch {
          ;[hand, segmenter] = await make('CPU')
        }
        if (disposed) {
          hand.close()
          segmenter.close()
        } else setStatus({ phase: 'running', segmentation: true, hands: true })
      } catch (e) {
        segmentationFailedRef.current = true
        if (!disposed)
          setStatus({
            phase: 'running',
            segmentation: false,
            hands: false,
            error: `模型加载失败：${e instanceof Error ? e.message : String(e)}`,
          })
      }
    }
    void load()
    const drawScene = (w: number, h: number, now = performance.now()) => {
      const data = getScene(sceneRef.current)
      const image = sceneImageRef.current
      const previousImage = previousSceneImageRef.current
      const fade = sceneFadeAtRef.current ? clamp((now - sceneFadeAtRef.current) / 1200) : 1
      if (previousImage && fade < 1) {
        const r = coverRect(previousImage.naturalWidth || 16, previousImage.naturalHeight || 9, w, h)
        ctx.globalAlpha = 1 - fade
        ctx.drawImage(previousImage, r.x, r.y, r.w, r.h)
        ctx.globalAlpha = 1
      }
      if (image) {
        const r = coverRect(image.naturalWidth || 16, image.naturalHeight || 9, w, h)
        ctx.globalAlpha = fade
        ctx.drawImage(image, r.x, r.y, r.w, r.h)
        ctx.globalAlpha = 1
      } else if (!previousImage || fade >= 1) drawFallback(ctx, data.fallback, w, h)
      if (fade >= 1) previousSceneImageRef.current = null
    }
    const drawVideo = (target: CanvasRenderingContext2D, w: number, h: number, alpha = 1) => {
      if (!video.videoWidth || video.readyState < 2) return
      const r = coverRect(video.videoWidth, video.videoHeight, w, h)
      target.save()
      target.globalAlpha = alpha
      if (mirrored) {
        target.translate(w, 0)
        target.scale(-1, 1)
      }
      target.drawImage(video, r.x, r.y, r.w, r.h)
      target.restore()
    }
    const drawHands = (
      target: CanvasRenderingContext2D,
      current: TrackedHand[],
      w: number,
      h: number,
      now: number,
    ) => {
      target.save()
      target.lineWidth = Math.max(1, Math.min(w, h) / 640)
      target.strokeStyle = 'rgba(255,255,255,.88)'
      target.fillStyle = '#fff'
      target.shadowColor = 'rgba(255,255,255,.8)'
      target.shadowBlur = 7
      current.forEach((item) => {
        target.beginPath()
        CONNECTIONS.forEach(([a, b]) => {
          const p = item.landmarks[a],
            q = item.landmarks[b]
          target.moveTo(p.x * w, p.y * h)
          target.lineTo(q.x * w, q.y * h)
        })
        target.stroke()
        target.shadowBlur = 3
        item.landmarks.forEach((p) => {
          target.beginPath()
          target.arc(p.x * w, p.y * h, Math.max(1, w / 700), 0, TAU)
          target.fill()
        })
        if (item.pinching) {
          target.shadowBlur = 12
          target.beginPath()
          target.arc(item.pinchPoint.x * w, item.pinchPoint.y * h, 5 + Math.sin(now / 100) * 2, 0, TAU)
          target.stroke()
        }
      })
      target.restore()
    }
    const updateHands = (result: HandLandmarkerResult, now: number) => {
      const next: TrackedHand[] = []
      result.landmarks.forEach((landmarks, index) => {
        const points = landmarks.map((p) => ({ x: mirrored ? 1 - p.x : p.x, y: p.y }))
        const prior = handsRef.current[index]
        const smooth =
          prior?.landmarks.length === points.length
            ? points.map((p, i) => ({
                x: lerp(prior.landmarks[i].x, p.x, 0.42),
                y: lerp(prior.landmarks[i].y, p.y, 0.42),
              }))
            : points
        const size = Math.hypot(smooth[0].x - smooth[9].x, smooth[0].y - smooth[9].y) || 0.1,
          distance = Math.hypot(smooth[4].x - smooth[8].x, smooth[4].y - smooth[8].y) / size,
          side = (result.handedness[index]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right') as
            'Left' | 'Right',
          was = pinchStateRef.current.get(side) ?? false,
          pinching = was ? distance < 0.44 : distance < 0.31,
          pinchPoint = { x: (smooth[4].x + smooth[8].x) / 2, y: (smooth[4].y + smooth[8].y) / 2 },
          item: TrackedHand = {
            handedness: side,
            landmarks: smooth,
            pinching,
            pinchPoint,
            openPalm: isOpenPalm(smooth),
          }
        next.push(item)
        if (pinching !== was) {
          pinchStateRef.current.set(side, pinching)
          const event: PinchEvent = {
            phase: pinching ? 'start' : 'end',
            hand: side,
            x: pinchPoint.x,
            y: pinchPoint.y,
          }
          pinchListenersRef.current.forEach((cb) => cb(event))
        } else if (pinching) {
          const event: PinchEvent = { phase: 'move', hand: side, x: pinchPoint.x, y: pinchPoint.y }
          pinchListenersRef.current.forEach((cb) => cb(event))
          particlesRef.current.push({
            x: pinchPoint.x,
            y: pinchPoint.y,
            vx: 0,
            vy: -0.0001,
            life: 0,
            maxLife: 280,
            size: 2.2,
            color: '#fff',
            twinkle: now / 100,
            gravity: 0,
            star: true,
          })
        }
      })
      handsRef.current = next
      const up = next.length >= 2 && next.every((h) => h.openPalm && h.landmarks[0].y < 0.55),
        down = next.length < 2 || next.every((h) => !h.openPalm || h.landmarks[0].y > 0.62)
      if (up) {
        if (!handsUpAt) handsUpAt = now
        if (!gestureUp && now - handsUpAt > 300) {
          gestureUp = true
          if (modeRef.current === 'gesture' && manualBackgroundRef.current === null) {
            bgTargetRef.current = 1
            handle.fountain({ x: 0.5 })
            handle.flyBirds(7)
          }
          gestureListenersRef.current.forEach((cb) => cb('hands-up'))
        }
      } else handsUpAt = 0
      if (gestureUp && down) {
        if (!handsDownAt) handsDownAt = now
        if (now - handsDownAt > 1500) {
          gestureUp = false
          if (modeRef.current === 'gesture' && manualBackgroundRef.current === null) bgTargetRef.current = 0
          gestureListenersRef.current.forEach((cb) => cb('hands-down'))
        }
      } else handsDownAt = 0
    }
    // dt is passed in: `previous` has already been advanced to `now` by the time these run.
    const particles = (dt: number, w: number, h: number) => {
      for (let i = particlesRef.current.length - 1; i >= 0; i -= 1) {
        const p = particlesRef.current[i],
          age = (p.life += dt)
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += p.gravity * dt
        if (age > p.maxLife || p.y > 1.12) {
          particlesRef.current.splice(i, 1)
          continue
        }
        ctx.save()
        ctx.globalAlpha = (1 - age / p.maxLife) * (0.55 + Math.sin(age / 65 + p.twinkle) * 0.35)
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = p.size * 5
        const x = p.x * w,
          y = p.y * h
        if (p.star) {
          ctx.translate(x, y)
          ctx.rotate(age / 120)
          ctx.beginPath()
          for (let k = 0; k < 8; k += 1) {
            const r = k % 2 ? p.size * 0.35 : p.size * 1.7,
              a = (k * Math.PI) / 4
            if (!k) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
          }
          ctx.closePath()
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.arc(x, y, p.size, 0, TAU)
          ctx.fill()
        }
        ctx.restore()
      }
    }
    const birds = (now: number, dt: number, w: number, h: number) => {
      for (let i = birdsRef.current.length - 1; i >= 0; i -= 1) {
        const b = birdsRef.current[i]
        b.life += dt
        b.x += b.speed * dt
        if (b.x > 1.15) {
          birdsRef.current.splice(i, 1)
          continue
        }
        const x = b.x * w,
          y = b.y * h + Math.sin(now / 600 + b.phase) * h * 0.012,
          size = b.size * w,
          flap = Math.sin(now / 130 + b.phase) * size * 0.6
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,.9)'
        ctx.lineWidth = Math.max(1, size / 14)
        ctx.lineCap = 'round'
        ctx.shadowColor = '#fff'
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.quadraticCurveTo(x - size * 0.65, y - size * 0.35 - flap, x - size, y)
        ctx.moveTo(x, y)
        ctx.quadraticCurveTo(x + size * 0.65, y - size * 0.35 + flap, x + size, y)
        ctx.stroke()
        ctx.restore()
      }
    }
    const cards = (now: number, w: number, h: number) => {
      for (let i = cardsRef.current.length - 1; i >= 0; i -= 1) {
        const card = cardsRef.current[i],
          age = now - card.born
        if (card.duration > 0 && age > card.duration) {
          cardsRef.current.splice(i, 1)
          continue
        }
        const fade = Math.min(1, age / 600, card.duration > 0 ? (card.duration - age) / 700 : 1),
          x = (card.x + Math.sin(now / 1800 + card.seed * 8) * 0.012) * w,
          y = (card.y + Math.cos(now / 2100 + card.seed * 6) * 0.012) * h,
          cw = card.w * w,
          ch = cw * 0.75
        ctx.save()
        ctx.globalAlpha = clamp(fade)
        ctx.translate(x, y)
        ctx.rotate(card.angle + Math.sin(now / 1400 + card.seed) * 0.025)
        ctx.shadowColor = 'rgba(255,255,255,.75)'
        ctx.shadowBlur = 18
        ctx.fillStyle = 'rgba(255,255,255,.18)'
        ctx.strokeStyle = 'rgba(255,255,255,.85)'
        ctx.lineWidth = 1.2
        const r = Math.min(14, cw * 0.06)
        ctx.beginPath()
        ctx.roundRect(-cw / 2, -ch / 2, cw, ch, r)
        ctx.fill()
        ctx.stroke()
        ctx.clip()
        if (card.image && !card.failed) ctx.drawImage(card.image, -cw / 2, -ch / 2, cw, ch)
        else {
          const g = ctx.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2)
          g.addColorStop(0, 'rgba(255,255,255,.65)')
          g.addColorStop(1, 'rgba(180,220,255,.2)')
          ctx.fillStyle = g
          ctx.fillRect(-cw / 2, -ch / 2, cw, ch)
        }
        ctx.restore()
      }
    }
    const grainLayer = (w: number, h: number) => {
      if (!grain) return
      ctx.save()
      ctx.globalAlpha = 0.055
      if (grainPattern) {
        ctx.fillStyle = grainPattern
        ctx.fillRect(0, 0, w, h)
      }
      const g = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.2,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.75,
      )
      g.addColorStop(0, 'transparent')
      g.addColorStop(1, 'rgba(20,30,70,.25)')
      ctx.globalAlpha = 0.6
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.restore()
    }
    let segmentTimestamp = 0,
      handTimestamp = 0
    const draw = (now: number) => {
      if (disposed) return
      raf = requestAnimationFrame(draw)
      const dpr = Math.min(window.devicePixelRatio || 1, 2),
        w = Math.max(1, Math.round(wrap.clientWidth * dpr)),
        h = Math.max(1, Math.round(wrap.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        personCanvas.width = w
        personCanvas.height = h
      }
      const dt = now - previous
      previous = now
      frames += 1
      if (now - fpsAt > 500) {
        setStatus({ fps: Math.round((frames * 1000) / (now - fpsAt)) })
        fpsAt = now
        frames = 0
      }
      const target =
        modeRef.current === 'off' || (modeRef.current === 'on' && segmentationFailedRef.current)
          ? 0
          : modeRef.current === 'on'
            ? 1
            : bgTargetRef.current
      activeMixRef.current = lerp(activeMixRef.current, target, 1 - Math.pow(0.001, dt / 1200))
      // Cap the step so a tab coming back from the background doesn't fling particles off screen.
      const step = Math.min(dt, 100)
      drawScene(w, h, now)
      if (video.videoWidth) {
        const mix = activeMixRef.current
        if (mix > 0.01 && segmenter && now - lastSegmentAt > 70) {
          lastSegmentAt = now
          const timestamp = Math.max(now, segmentTimestamp + 1)
          segmentTimestamp = timestamp
          try {
            const result: ImageSegmenterResult = segmenter.segmentForVideo(video, timestamp)
            // selfie_segmenter has a single person channel; multi-class models put the person last.
            const masks = result.confidenceMasks
            const mask = masks?.[masks.length - 1]
            if (mask && maskCtx && softMaskCtx) {
              const values = mask.getAsFloat32Array(),
                mw = mask.width,
                mh = mask.height
              if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
                maskCanvas.width = mw
                maskCanvas.height = mh
                softMask.width = mw
                softMask.height = mh
              }
              const data = maskCtx.createImageData(mw, mh)
              for (let i = 0; i < values.length; i += 1)
                data.data[i * 4 + 3] = Math.round(clamp(values[i]) * 255)
              maskCtx.putImageData(data, 0, 0)
              // Soften the edge once per mask, at mask resolution, instead of blurring every frame.
              softMaskCtx.clearRect(0, 0, mw, mh)
              softMaskCtx.filter = 'blur(1px)'
              softMaskCtx.drawImage(maskCanvas, 0, 0)
              softMaskCtx.filter = 'none'
              hasMask = true
            }
            result.close()
            setStatus({ segmentation: true })
          } catch (e) {
            hasMask = false
            segmentationFailedRef.current = true
            segmenter.close()
            segmenter = null
            setStatus({
              segmentation: false,
              error: `分割暂不可用：${e instanceof Error ? e.message : String(e)}`,
            })
          }
        }
        // The room fades out around the person; the person is never faded. Every frame is
        // recomposed from the live video and the latest mask, so frames between segmentation
        // passes don't fall back to the raw camera image.
        const personMix = hasMask ? mix : 0
        if (personMix < 0.99) drawVideo(ctx, w, h, 1 - personMix)
        const pctx = personMix > 0.01 ? personCanvas.getContext('2d') : null
        if (pctx) {
          pctx.clearRect(0, 0, w, h)
          drawVideo(pctx, w, h)
          pctx.globalCompositeOperation = 'destination-in'
          const r = coverRect(video.videoWidth, video.videoHeight, w, h)
          pctx.save()
          // The mask comes from the unmirrored frame, so flip it the same way drawVideo does.
          if (mirrored) {
            pctx.translate(w, 0)
            pctx.scale(-1, 1)
          }
          pctx.drawImage(softMask, r.x, r.y, r.w, r.h)
          pctx.restore()
          pctx.globalCompositeOperation = 'source-over'
          ctx.drawImage(personCanvas, 0, 0)
        }
        if (hand && now - lastHandAt > 45) {
          lastHandAt = now
          const timestamp = Math.max(now, handTimestamp + 1)
          handTimestamp = timestamp
          try {
            updateHands(hand.detectForVideo(video, timestamp), now)
            setStatus({ hands: true })
          } catch {
            setStatus({ hands: false })
          }
        }
      } else handsRef.current = []
      birds(now, step, w, h)
      cards(now, w, h)
      if (
        ambientSparkles &&
        particlesRef.current.length < (reducedMotionRef.current ? 20 : 55) &&
        Math.random() < 0.08
      )
        handle.burst({ x: Math.random(), y: 0.7 + Math.random() * 0.25, count: 1, spread: 0.01 })
      particles(step, w, h)
      if (showHands && handsRef.current.length) drawHands(ctx, handsRef.current, w, h, now)
      overlayRef.current?.(ctx, w, h, now)
      grainLayer(w, h)
    }
    raf = requestAnimationFrame(draw)
    onReady?.(handle)
    setStatus({ phase: 'running' })
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      hand?.close()
      segmenter?.close()
      handsStore.length = 0
      particlesStore.length = 0
      birdsStore.length = 0
      cardsStore.length = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, mirrored, showHands, grain, ambientSparkles])
  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', background: getScene(sceneProp).fallback, ...style }}
    >
      <video ref={videoRef} muted playsInline style={{ display: 'none' }} />
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
      <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
    </div>
  )
}
