// Live subtitles drawn into the stage canvas through setOverlayRenderer, so they appear in recordings.
// Lays out every word itself and keeps the boxes in stage coordinates for effects and hit-testing.
import type { HandPoint, OverlayRenderer } from '../../effects'
import type { ExpectedWord } from './matcher'

export interface SubtitleFrame {
  key: number // sentence index; the layout is recomputed when it changes
  words: ExpectedWord[]
  zh: string
  next: string | null
  hitAt: Map<number, number> // word index -> performance.now() of the hit (may lie slightly ahead)
  shownAt: number // when the sentence (or attempt) appeared
  perfectAt: number | null
  perfectText: string
  collected: { index: number; at: number } | null
}

/** Word box in normalized stage coordinates (0..1), plus its centre. */
export interface WordBox {
  index: number
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
}

interface Placed {
  word: ExpectedWord
  x: number // left edge, canvas px
  cy: number // vertical centre, canvas px
  width: number
}

interface Layout {
  id: string
  key: number
  size: number
  placed: Placed[]
  zh: string[]
  zhSize: number
  zhTop: number
  next: string[]
  nextSize: number
  nextTop: number
  top: number
}

const EN_FONT = '"Avenir Next", "Helvetica Neue", system-ui, sans-serif'
const ZH_FONT = '"PingFang SC", "Hiragino Sans GB", system-ui, sans-serif'
const DREAM_FONT = 'Didot, "Bodoni 72", "Times New Roman", serif'
const OUTLINE = 'rgba(28, 52, 110, 0.4)'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function wrap(widths: number[], space: number, maxW: number): number[][] {
  const lines: number[][] = []
  let line: number[] = []
  let w = 0
  widths.forEach((ww, i) => {
    const add = line.length ? space + ww : ww
    if (line.length && w + add > maxW) {
      lines.push(line)
      line = [i]
      w = ww
    } else {
      line.push(i)
      w += add
    }
  })
  if (line.length) lines.push(line)
  return lines
}

/** Wraps free text (by words, or by characters for Chinese) into at most `max` lines. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, max: number, byChar: boolean): string[] {
  const parts = byChar ? [...text] : text.split(/\s+/).filter(Boolean)
  const sep = byChar ? '' : ' '
  const lines: string[] = []
  let cur = ''
  for (const p of parts) {
    const tryLine = cur ? cur + sep + p : p
    if (cur && ctx.measureText(tryLine).width > maxW) {
      lines.push(cur)
      cur = p
    } else cur = tryLine
  }
  if (cur) lines.push(cur)
  if (lines.length > max) {
    lines.length = max
    lines[max - 1] = `${lines[max - 1].replace(/\s*\S$/, '')}…`
  }
  return lines
}

function computeLayout(ctx: CanvasRenderingContext2D, f: SubtitleFrame, W: number, H: number, dpr: number): Layout {
  const maxW = Math.min(W * 0.86, 1500 * dpr)
  const minSize = Math.max(H * 0.034, 18 * dpr)
  let size = Math.min(Math.max(H * 0.064, 26 * dpr), 66 * dpr)
  let widths: number[] = []
  let lines: number[][] = []
  for (;;) {
    ctx.font = `600 ${size}px ${EN_FONT}`
    widths = f.words.map((w) => ctx.measureText(w.display).width)
    lines = wrap(widths, ctx.measureText(' ').width, maxW)
    if (lines.length <= 3 || size <= minSize) break
    size = Math.max(minSize, size * 0.9)
  }
  const space = ctx.measureText(' ').width
  const lineH = size * 1.3

  const zhSize = Math.max(size * 0.46, 15 * dpr)
  ctx.font = `500 ${zhSize}px ${ZH_FONT}`
  const zh = f.zh ? wrapText(ctx, f.zh, maxW, 2, true) : []
  const nextSize = Math.max(size * 0.4, 14 * dpr)
  ctx.font = `italic 500 ${nextSize}px ${EN_FONT}`
  const next = f.next ? wrapText(ctx, f.next, maxW, 2, false) : []

  const zhH = zh.length * zhSize * 1.45
  const nextH = next.length ? size * 0.5 + next.length * nextSize * 1.4 : 0
  const total = lines.length * lineH + (zh.length ? size * 0.3 : 0) + zhH + nextH
  const bottom = H - Math.max(H * 0.13, 108 * dpr) // keep clear of the DOM control bar
  const top = Math.max(H * 0.3, bottom - total)

  const placed: Placed[] = []
  lines.forEach((line, li) => {
    const lineW = line.reduce((s, i) => s + widths[i], 0) + space * (line.length - 1)
    let x = (W - lineW) / 2
    const cy = top + lineH * (li + 0.5)
    for (const i of line) {
      placed.push({ word: f.words[i], x, cy, width: widths[i] })
      x += widths[i] + space
    }
  })
  const zhTop = top + lines.length * lineH + (zh.length ? size * 0.3 : 0)
  return {
    id: `${f.key}|${W}|${H}`,
    key: f.key,
    size,
    placed,
    zh,
    zhSize,
    zhTop,
    next,
    nextSize,
    nextTop: zhTop + zhH + (next.length ? size * 0.5 : 0),
    top,
  }
}

const SETTLE_MS = 1100 // after this a hit word is static and drawn from the cache

/** age < 0: not hit yet (white); finite: pop + gold fill animation; Infinity: settled gold. */
function drawWord(ctx: CanvasRenderingContext2D, size: number, p: Placed, age: number) {
  const hit = age >= 0
  const scale = hit && age < SETTLE_MS ? 1 + 0.5 * Math.exp(-age / 220) * Math.sin(Math.min(age / 70, 3 * Math.PI)) : 1
  const x0 = -p.width / 2
  ctx.save()
  ctx.translate(p.x + p.width / 2, p.cy)
  ctx.scale(scale, scale)
  ctx.font = `600 ${size}px ${EN_FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = size * 0.09
  ctx.strokeStyle = OUTLINE
  ctx.strokeText(p.word.display, x0, 0)
  ctx.shadowColor = 'rgba(255, 255, 255, 0.85)'
  ctx.shadowBlur = size * 0.22
  ctx.fillStyle = p.word.units.length ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'
  ctx.fillText(p.word.display, x0, 0)
  if (hit) {
    const fill = clamp01(age / 260)
    const glow = Number.isFinite(age) ? Math.exp(-age / 500) : 0
    ctx.beginPath()
    ctx.rect(x0 - size * 0.2, -size, (p.width + size * 0.4) * fill, size * 2)
    ctx.clip()
    const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5)
    g.addColorStop(0, '#fff7cf')
    g.addColorStop(0.55, '#ffe08f')
    g.addColorStop(1, '#ffc2da')
    ctx.fillStyle = g
    ctx.shadowColor = `rgba(255, 196, 120, ${0.55 + 0.4 * glow})`
    ctx.shadowBlur = size * (0.28 + 0.9 * glow)
    ctx.fillText(p.word.display, x0, 0)
  }
  ctx.restore()
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], top: number, size: number, step: number, W: number) {
  ctx.lineWidth = size * 0.12
  lines.forEach((line, i) => {
    const y = top + size * step * (i + 0.5)
    ctx.shadowColor = 'transparent'
    ctx.strokeText(line, W / 2, y)
    ctx.shadowColor = 'rgba(255, 255, 255, 0.7)'
    ctx.fillText(line, W / 2, y)
  })
}

function drawStatic(ctx: CanvasRenderingContext2D, L: Layout, W: number) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = OUTLINE
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.shadowBlur = L.zhSize * 0.3
  ctx.font = `500 ${L.zhSize}px ${ZH_FONT}`
  drawLines(ctx, L.zh, L.zhTop, L.zhSize, 1.45, W)
  ctx.globalAlpha = 0.55
  ctx.font = `italic 500 ${L.nextSize}px ${EN_FONT}`
  drawLines(ctx, L.next, L.nextTop, L.nextSize, 1.4, W)
  ctx.restore()
}

export class SubtitlePainter {
  private getFrame: () => SubtitleFrame | null
  private layout: Layout | null = null
  private cache: HTMLCanvasElement | null = null
  private cacheSig = ''
  private cacheY = 0
  private W = 1
  private H = 1

  constructor(getFrame: () => SubtitleFrame | null) {
    this.getFrame = getFrame
  }

  render: OverlayRenderer = (ctx, width, height, t) => {
    const f = this.getFrame()
    if (!f || !f.words.length) return
    const el = ctx.canvas as HTMLCanvasElement | undefined
    const dpr = el?.clientWidth ? width / el.clientWidth : window.devicePixelRatio || 1
    let L = this.layout
    if (!L || L.id !== `${f.key}|${width}|${height}`) {
      ctx.save()
      L = this.layout = computeLayout(ctx, f, width, height, dpr)
      ctx.restore()
      this.cacheSig = ''
    }
    this.W = width
    this.H = height

    // 'w' white, 'a' animating (drawn live), 'g' settled gold
    const states = L.placed.map((p) => {
      const at = f.hitAt.get(p.word.index)
      if (at === undefined || t < at) return 'w'
      return t - at < SETTLE_MS ? 'a' : 'g'
    })
    const sig = `${L.id}|${states.join('')}`
    if (sig !== this.cacheSig) this.rebuildCache(L, states, width, sig)

    ctx.save()
    const appear = clamp01((t - f.shownAt) / 350)
    ctx.globalAlpha = appear
    ctx.translate(0, (1 - appear) * L.size * 0.25)
    if (this.cache) ctx.drawImage(this.cache, 0, this.cacheY)
    L.placed.forEach((p, i) => {
      if (states[i] === 'a') drawWord(ctx, L.size, p, t - (f.hitAt.get(p.word.index) ?? t))
    })
    if (f.collected) this.drawCollected(ctx, L, f.collected, t)
    if (f.perfectAt !== null) this.drawPerfect(ctx, L, f.perfectText, t - f.perfectAt, width)
    ctx.restore()
  }

  private rebuildCache(L: Layout, states: string[], W: number, sig: string) {
    const y0 = Math.max(0, Math.floor(L.top - L.size * 1.2))
    const y1 = Math.ceil(L.nextTop + L.next.length * L.nextSize * 1.4 + L.size)
    const c = (this.cache ??= document.createElement('canvas'))
    const h = Math.max(1, y1 - y0)
    if (c.width !== W || c.height !== h) {
      c.width = W
      c.height = h
    }
    const g = c.getContext('2d')
    if (!g) {
      this.cache = null
      return
    }
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, c.width, c.height)
    g.translate(0, -y0)
    L.placed.forEach((p, i) => {
      if (states[i] !== 'a') drawWord(g, L.size, p, states[i] === 'g' ? Infinity : -1)
    })
    drawStatic(g, L, W)
    this.cacheY = y0
    this.cacheSig = sig
  }

  private drawCollected(ctx: CanvasRenderingContext2D, L: Layout, c: { index: number; at: number }, t: number) {
    const age = t - c.at
    const p = L.placed.find((q) => q.word.index === c.index)
    if (!p || age < 0 || age > 1400) return
    const a = 1 - age / 1400
    const pad = L.size * (0.18 + 0.25 * (1 - a))
    ctx.save()
    ctx.globalAlpha *= a
    ctx.strokeStyle = '#ffd1e4'
    ctx.lineWidth = L.size * 0.06
    ctx.shadowColor = '#ff9cc6'
    ctx.shadowBlur = L.size * 0.4
    ctx.beginPath()
    ctx.roundRect(p.x - pad, p.cy - L.size * 0.62 - pad * 0.5, p.width + pad * 2, L.size * 1.24 + pad, L.size * 0.4)
    ctx.stroke()
    ctx.restore()
  }

  private drawPerfect(ctx: CanvasRenderingContext2D, L: Layout, text: string, age: number, W: number) {
    if (age < 0 || age > 1500) return
    const a = age < 200 ? age / 200 : 1 - clamp01((age - 1000) / 500)
    const s = 0.8 + 0.2 * Math.min(1, age / 260) + 0.04 * Math.sin(age / 120)
    const size = L.size * 1.15
    ctx.save()
    ctx.globalAlpha *= a
    ctx.translate(W / 2, L.top - size * 0.75)
    ctx.scale(s, s)
    ctx.font = `italic 400 ${size}px ${DREAM_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(255, 214, 150, 0.95)'
    ctx.shadowBlur = size * 0.5
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(1, '#ffe3a3')
    ctx.fillStyle = g
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }

  /** Word boxes of sentence `key` in stage coordinates; empty until that sentence has been drawn once. */
  boxes(key: number): WordBox[] {
    const L = this.layout
    if (!L || L.key !== key) return []
    return L.placed
      .filter((p) => p.word.units.length > 0)
      .map((p) => {
        const h = L.size * 1.2
        const x = p.x / this.W
        const y = (p.cy - h / 2) / this.H
        const w = p.width / this.W
        const hh = h / this.H
        return { index: p.word.index, x, y, w, h: hh, cx: x + w / 2, cy: y + hh / 2 }
      })
  }

  box(index: number, key: number): WordBox | undefined {
    return this.boxes(key).find((b) => b.index === index)
  }

  /** Stage width / height of the last frame drawn. */
  aspect(): number {
    return this.W / this.H
  }

  /** Bounding box of all words of sentence `key`, in stage coordinates. */
  bounds(key: number): { x: number; y: number; w: number; h: number } | null {
    const b = this.boxes(key)
    if (!b.length) return null
    const x = Math.min(...b.map((q) => q.x))
    const y = Math.min(...b.map((q) => q.y))
    return { x, y, w: Math.max(...b.map((q) => q.x + q.w)) - x, h: Math.max(...b.map((q) => q.y + q.h)) - y }
  }

  /**
   * The word under `p` (stage coordinates) or the nearest within `slack` word heights, or null.
   * Only valid for the sentence with `key`, so a stale layout never answers for a new sentence.
   */
  hitTest(p: HandPoint, key: number, slack = 0.25): number | null {
    const L = this.layout
    if (!L || L.key !== key) return null
    const px = p.x * this.W
    const py = p.y * this.H
    let best: number | null = null
    let bestD = L.size * 1.2 * slack
    for (const q of L.placed) {
      if (!q.word.units.length) continue
      const half = L.size * 0.6
      const dx = Math.max(q.x - px, 0, px - (q.x + q.width))
      const dy = Math.max(q.cy - half - py, 0, py - (q.cy + half))
      const d = Math.hypot(dx, dy)
      if (d <= bestD) {
        bestD = d
        best = q.word.index
      }
    }
    return best
  }
}
