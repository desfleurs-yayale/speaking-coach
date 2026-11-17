// State machine of one shadowing session: sentence progress, speech matching, effects, recording and saving.
// Plain class (no React) so callbacks from the recogniser, the stage and timers always see the current state.
import type { DreamStageHandle } from '../../effects'
import { addVocab, hasVocab, newId, normalizeWord, saveRecording, saveSession } from '../../lib/db'
import { DREAM_CARDS } from '../../lib/dreamAssets'
import { isSpeechRecognitionSupported, SpeechListener, type ListenerState, type SpeechUpdate } from '../../lib/speech'
import { speak, stopSpeaking } from '../../lib/tts'
import type { Lesson, SentenceResult, ShadowingSession } from '../../lib/types'
import { isComplete, isScorable, matchTranscript, tokenizeSentence, type ExpectedWord } from './matcher'
import { SessionRecorder } from './recorder'
import { SubtitlePainter, type SubtitleFrame } from './subtitles'

export type SessionPhase = 'ready' | 'running' | 'ending' | 'failed'
export type RecState = 'idle' | 'recording' | 'paused' | 'unsupported' | 'error'

export type SessionEvent =
  | { type: 'changed' }
  | { type: 'toast'; text: string }
  | { type: 'hands-up' }
  | { type: 'finished'; sessionId: string; recordingFailed: boolean }

interface Progress {
  attempts: number
  best: Set<number> // hits of the best attempt so far
  current: Set<number> // hits of the running attempt
}

const ADVANCE_MS = 1200
const HIT_STAGGER_MS = 90
const PINCH_SLACK = 1.2 // word heights around a word that still count as "near" for a pinch
const CLICK_SLACK = 0.3
const HIT_COLORS = ['#fff1c4', '#ffe08f', '#ffd1e4']

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** "morning!" -> "morning", "“Hello," -> "Hello" (keeps inner apostrophes and hyphens). */
const bareWord = (display: string) => display.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

export class ShadowingController {
  readonly lesson: Lesson
  readonly words: ExpectedWord[][]
  readonly painter: SubtitlePainter
  readonly speechSupported = isSpeechRecognitionSupported()
  phase: SessionPhase = 'ready'
  index = 0
  startedAt = 0
  speechState: ListenerState = 'idle'
  speechError: string | null = null
  speaking = false // TTS playing the original sentence
  recordWanted = true
  recState: RecState = 'idle'
  failure: string | null = null
  version = 0 // bumped on every 'changed' event (snapshot for useSyncExternalStore)

  private listeners = new Set<(e: SessionEvent) => void>()
  private progress: Progress[]
  private frame: SubtitleFrame | null = null
  private stage: DreamStageHandle | null = null
  private stream: MediaStream | null = null
  private listener: SpeechListener | null = null
  private recorder: SessionRecorder | null = null
  private timers = new Set<number>()
  private advanceTimer = 0
  private ttsToken = 0
  private ignoreUntil = 0
  private lastCollect = { key: -1, index: -1, at: 0 }
  private disposed = false

  constructor(lesson: Lesson) {
    this.lesson = lesson
    this.words = lesson.sentences.map((s) => tokenizeSentence(s.text))
    this.progress = lesson.sentences.map(() => ({ attempts: 0, best: new Set(), current: new Set() }))
    this.painter = new SubtitlePainter(() => this.frame)
  }

  get total(): number {
    return this.lesson.sentences.length
  }

  on(fn: (e: SessionEvent) => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Connects the stage; returns the cleanup. Safe to call again after cleanup (React StrictMode). */
  attachStage(stage: DreamStageHandle): () => void {
    this.stage = stage
    stage.setOverlayRenderer(this.painter.render)
    const offPinch = stage.onPinch((e) => {
      if (e.phase !== 'start' || this.phase !== 'running') return
      const index = this.painter.hitTest(e, this.index, PINCH_SLACK)
      if (index !== null) void this.collect(index)
    })
    const offGesture = stage.onGesture((g) => {
      if (g === 'hands-up') this.emit({ type: 'hands-up' })
    })
    return () => {
      offPinch()
      offGesture()
      stage.setOverlayRenderer(null)
      if (this.stage === stage) this.stage = null
    }
  }

  /** Called on mount; undoes a dispose() from React StrictMode's simulated unmount. */
  revive() {
    this.disposed = false
  }

  /** Stops everything without saving (the page is going away). */
  dispose() {
    this.disposed = true
    this.clearTimers()
    this.ttsToken++
    stopSpeaking()
    this.listener?.stop()
    this.listener = null
    void this.recorder?.stop()
    this.recorder = null
    if (this.phase === 'running') this.phase = 'ready'
  }

  /** Starts the session once the camera stream is open (call from the user's click). */
  start(stream: MediaStream) {
    if (this.phase !== 'ready' || !this.total) return
    this.stream = stream
    this.phase = 'running'
    this.startedAt = Date.now()
    if (this.speechSupported) {
      this.listener = new SpeechListener({
        lang: 'en-US',
        onUpdate: (u) => this.onSpeech(u),
        onState: (s, error) => {
          this.speechState = s
          if (s === 'error') this.speechError = error ?? '语音识别出错。'
          else if (s === 'listening') this.speechError = null
          this.changed()
        },
      })
      this.listener.start()
    }
    if (this.recordWanted) this.startRecorder()
    this.enter(0)
  }

  next() {
    if (this.phase !== 'running') return
    if (this.index >= this.total - 1) void this.finish()
    else this.enter(this.index + 1)
  }

  prev() {
    if (this.phase === 'running' && this.index > 0) this.enter(this.index - 1)
  }

  /** 重读: a fresh attempt at the current sentence. */
  retry() {
    if (this.phase === 'running') this.enter(this.index)
  }

  /** 听原句: speaks the sentence with the recogniser paused, so it does not hear itself. */
  async listen() {
    if (this.phase !== 'running') return
    const token = ++this.ttsToken
    this.speaking = true
    this.listener?.stop()
    this.changed()
    await speak(this.lesson.sentences[this.index].text)
    if (token !== this.ttsToken) return // replaced by a newer request, or the session ended
    this.later(() => {
      if (token !== this.ttsToken) return
      this.speaking = false
      if (this.phase === 'running' && !this.disposed) {
        this.ignoreUntil = performance.now() + 200
        this.listener?.start()
      }
      this.changed()
    }, 250)
  }

  setRecording(on: boolean) {
    this.recordWanted = on
    if (this.phase === 'running') {
      if (!on) {
        this.recorder?.pause()
        if (this.recorder) this.recState = 'paused'
      } else if (this.recorder) {
        this.recorder.resume()
        this.recState = 'recording'
      } else this.startRecorder()
    }
    this.changed()
  }

  /** Word index under a DOM point (stage coordinates via the handle), or null. */
  wordAt(clientX: number, clientY: number, slack = CLICK_SLACK): number | null {
    if (!this.stage || this.phase !== 'running') return null
    return this.painter.hitTest(this.stage.toStage(clientX, clientY), this.index, slack)
  }

  /** Adds a word of the current sentence to the vocabulary book, with a card and a toast. */
  async collect(index: number) {
    if (this.phase !== 'running') return
    const key = this.index
    const word = this.words[key][index]
    if (!word || !isScorable(word)) return
    const now = performance.now()
    const last = this.lastCollect
    if (last.key === key && last.index === index && now - last.at < 1500) return
    this.lastCollect = { key, index, at: now }
    const display = bareWord(word.display) || word.display
    if (this.frame?.key === key) this.frame.collected = { index, at: now }
    const box = this.painter.box(index, key)
    if (box && this.stage) {
      const widthRatio = 0.15
      const cardH = widthRatio * 0.75 * this.painter.aspect()
      this.stage.showCard({
        src: DREAM_CARDS[Math.floor(Math.random() * DREAM_CARDS.length)],
        x: clamp(box.cx, widthRatio / 2 + 0.02, 1 - widthRatio / 2 - 0.02),
        y: clamp(box.y - cardH / 2 - 0.03, cardH / 2 + 0.02, 1 - cardH / 2),
        widthRatio,
        durationMs: 4500,
      })
      this.stage.burst({ x: box.cx, y: box.cy, count: 24, color: '#ffd1e4' })
    }
    const sentence = this.lesson.sentences[key]
    try {
      const existed = await hasVocab(display)
      if (!existed) {
        await addVocab({
          word: display,
          display,
          context: sentence.text,
          contextZh: sentence.zh || undefined,
          lessonId: this.lesson.id,
        })
      }
      this.emit({ type: 'toast', text: existed ? `已在生词本: ${display}` : `已加入生词本: ${display}` })
    } catch {
      this.emit({ type: 'toast', text: '加入生词本失败，请稍后再试' })
    }
  }

  /** Ends the session: stops speech, TTS and recording, saves, then emits 'finished'. */
  async finish() {
    if (this.phase !== 'running') return
    this.phase = 'ending'
    this.clearTimers()
    this.ttsToken++
    this.speaking = false
    stopSpeaking()
    this.listener?.stop()
    this.listener = null
    this.changed()

    const blob = this.recorder ? await this.recorder.stop() : null
    this.recorder = null
    const session = this.buildSession()
    let recordingFailed = false
    if (blob) {
      const recordingId = newId('rec-')
      try {
        await saveRecording({ id: recordingId, sessionId: session.id, blob, mimeType: blob.type, createdAt: Date.now() })
        session.recordingId = recordingId
      } catch {
        recordingFailed = true
      }
    } else if (this.recState === 'error') recordingFailed = true
    try {
      await saveSession(session)
    } catch (e) {
      this.phase = 'failed'
      this.failure = `保存练习记录失败：${e instanceof Error ? e.message : String(e)}`
      this.changed()
      return
    }
    if (!this.disposed) this.emit({ type: 'finished', sessionId: session.id, recordingFailed })
  }

  private buildSession(): ShadowingSession {
    const sentences: SentenceResult[] = []
    this.lesson.sentences.forEach((s, i) => {
      const p = this.progress[i]
      if (!p.attempts) return // never reached
      const best = p.current.size > p.best.size ? p.current : p.best
      const scorable = this.words[i].filter(isScorable)
      const missed = scorable.filter((w) => !best.has(w.index))
      sentences.push({
        sentenceId: s.id,
        text: s.text,
        hitWords: scorable.length - missed.length,
        totalWords: scorable.length,
        missedWords: missed.map((w) => normalizeWord(w.display)).filter(Boolean),
        attempts: p.attempts,
      })
    })
    const total = sentences.reduce((n, s) => n + s.totalWords, 0)
    const hit = sentences.reduce((n, s) => n + s.hitWords, 0)
    return {
      id: newId('shadow-'),
      type: 'shadowing',
      lessonId: this.lesson.id,
      lessonTitle: this.lesson.title,
      startedAt: this.startedAt,
      durationMs: Date.now() - this.startedAt,
      score: total ? Math.round((hit * 100) / total) : 0,
      sentences,
    }
  }

  /** Shows sentence `i` and starts a new attempt at it. */
  private enter(i: number) {
    window.clearTimeout(this.advanceTimer)
    if (this.speaking) stopSpeaking() // listen() resumes the recogniser when the speech promise settles
    const p = this.progress[i]
    if (p.current.size > p.best.size) p.best = p.current
    p.attempts += 1
    p.current = new Set()
    this.index = i
    const s = this.lesson.sentences[i]
    this.frame = {
      key: i,
      words: this.words[i],
      zh: s.zh,
      next: this.lesson.sentences[i + 1]?.text ?? null,
      hitAt: new Map(),
      shownAt: performance.now(),
      perfectAt: null,
      perfectText: '',
      collected: null,
    }
    this.listener?.reset()
    this.ignoreUntil = performance.now() + 300 // late results of the previous sentence
    this.changed()
  }

  private onSpeech(u: SpeechUpdate) {
    if (this.phase !== 'running' || this.speaking || performance.now() < this.ignoreUntil) return
    const key = this.index
    const words = this.words[key]
    const p = this.progress[key]
    const frame = this.frame
    if (!frame || frame.key !== key || isComplete(words, p.current)) return
    const fresh = [...matchTranscript(words, u.fullText)].filter((i) => !p.current.has(i)).sort((a, b) => a - b)
    if (!fresh.length) return
    const now = performance.now()
    fresh.forEach((index, n) => {
      p.current.add(index)
      frame.hitAt.set(index, now + n * HIT_STAGGER_MS)
      this.later(() => this.burstAt(key, index, n), n * HIT_STAGGER_MS)
    })
    if (isComplete(words, p.current)) this.complete(key, fresh.length * HIT_STAGGER_MS)
  }

  private burstAt(key: number, index: number, n: number) {
    if (key !== this.index || !this.stage) return
    const box = this.painter.box(index, key)
    this.stage.burst({
      x: box?.cx ?? 0.5,
      y: box?.cy ?? 0.75,
      count: 34,
      color: HIT_COLORS[n % HIT_COLORS.length],
      spread: 0.035,
    })
  }

  private complete(key: number, delay: number) {
    const frame = this.frame
    if (!frame) return
    frame.perfectAt = performance.now() + delay
    frame.perfectText = this.progress[key].attempts === 1 ? 'Perfect ✦' : 'Well done ✦'
    this.later(() => {
      if (key !== this.index || !this.stage) return
      const b = this.painter.bounds(key)
      this.stage.fountain({ x: b ? b.x + b.w / 2 : 0.5, width: clamp(b?.w ?? 0.3, 0.2, 0.6) })
      this.stage.flyBirds()
    }, delay)
    window.clearTimeout(this.advanceTimer)
    this.advanceTimer = this.later(() => {
      if (this.phase === 'running' && this.index === key) this.next()
    }, delay + ADVANCE_MS)
  }

  private startRecorder() {
    if (!this.stage) {
      this.recState = 'error'
      return
    }
    let video: MediaStream
    try {
      video = this.stage.captureStream(30)
    } catch {
      this.recState = 'unsupported'
      return
    }
    const audio = this.stream?.getAudioTracks()[0] ?? null
    const rec = SessionRecorder.create(video, audio, () => {
      this.recState = 'error'
      this.changed()
    })
    if (!rec) {
      this.recState = 'unsupported'
      return
    }
    try {
      rec.start()
    } catch {
      void rec.stop()
      this.recState = 'error'
      return
    }
    this.recorder = rec
    this.recState = 'recording'
  }

  private later(fn: () => void, ms: number): number {
    const id = window.setTimeout(() => {
      this.timers.delete(id)
      fn()
    }, ms)
    this.timers.add(id)
    return id
  }

  private clearTimers() {
    this.timers.forEach((id) => window.clearTimeout(id))
    this.timers.clear()
    window.clearTimeout(this.advanceTimer)
  }

  private emit(e: SessionEvent) {
    if (e.type === 'changed') this.version++
    this.listeners.forEach((fn) => fn(e))
  }

  private changed() {
    if (!this.disposed) this.emit({ type: 'changed' })
  }
}
