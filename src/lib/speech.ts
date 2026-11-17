// Thin wrapper around the browser Web Speech API (Chrome: webkitSpeechRecognition).
// Recognition runs continuously with interim results and restarts itself when Chrome ends a session.

interface SRAlternative {
  transcript: string
  confidence: number
}
interface SRResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SRAlternative
}
interface SREvent extends Event {
  readonly resultIndex: number
  readonly results: { readonly length: number; [index: number]: SRResult }
}
interface SRErrorEvent extends Event {
  readonly error: string
  readonly message: string
}
interface SR extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: SRErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
type SRCtor = new () => SR

function getCtor(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return getCtor() !== null
}

export interface SpeechUpdate {
  /** Text finalized since start() (or since the last reset()), across auto-restarts. */
  finalText: string
  /** Current not-yet-final hypothesis. */
  interimText: string
  /** finalText + ' ' + interimText, trimmed. Use this for live word matching. */
  fullText: string
  /** True when this update contains a newly finalized segment. */
  isFinal: boolean
}

export type ListenerState = 'idle' | 'starting' | 'listening' | 'error'

export interface SpeechListenerOptions {
  lang?: string // default 'en-US'
  onUpdate: (u: SpeechUpdate) => void
  onState?: (s: ListenerState, error?: string) => void
}

function describeError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '麦克风权限被拒绝，无法识别语音。'
    case 'network':
      return '语音识别需要联网（Chrome 使用 Google 语音服务），请检查网络或代理。'
    case 'audio-capture':
      return '没有检测到麦克风。'
    case 'language-not-supported':
      return '浏览器不支持英文语音识别。'
    default:
      return `语音识别出错：${code}`
  }
}

export class SpeechListener {
  private rec: SR | null = null
  private wanted = false
  private finalText = ''
  private opts: SpeechListenerOptions
  private restartTimer = 0

  constructor(opts: SpeechListenerOptions) {
    this.opts = opts
  }

  get active(): boolean {
    return this.wanted
  }

  start(): void {
    const Ctor = getCtor()
    if (!Ctor) {
      this.opts.onState?.('error', '当前浏览器不支持语音识别，请使用桌面版 Chrome 或 Edge。')
      return
    }
    this.wanted = true
    this.opts.onState?.('starting')
    this.spawn(Ctor)
  }

  stop(): void {
    this.wanted = false
    window.clearTimeout(this.restartTimer)
    const r = this.rec
    this.rec = null
    if (r) {
      r.onend = null
      try {
        r.stop()
      } catch {
        /* already stopped */
      }
    }
    this.opts.onState?.('idle')
  }

  /** Forget everything recognized so far (call when moving to the next sentence). */
  reset(): void {
    this.finalText = ''
    // Restart the native session so stale interim text from the previous sentence is dropped.
    if (this.rec) {
      try {
        this.rec.abort()
      } catch {
        /* ignore */
      }
    }
  }

  private spawn(Ctor: SRCtor) {
    const r = new Ctor()
    r.lang = this.opts.lang ?? 'en-US'
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    r.onstart = () => this.opts.onState?.('listening')
    r.onresult = (e) => {
      if (this.rec !== r) return
      let interim = ''
      let gotFinal = false
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const t = res[0]?.transcript ?? ''
        if (res.isFinal) {
          this.finalText = `${this.finalText} ${t}`.trim()
          gotFinal = true
        } else interim += t
      }
      const interimText = interim.trim()
      this.opts.onUpdate({
        finalText: this.finalText,
        interimText,
        fullText: `${this.finalText} ${interimText}`.trim(),
        isFinal: gotFinal,
      })
    }
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return // benign, onend restarts
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        this.wanted = false
      }
      this.opts.onState?.('error', describeError(e.error))
    }
    r.onend = () => {
      if (this.rec !== r) return
      if (!this.wanted) {
        this.opts.onState?.('idle')
        return
      }
      this.restartTimer = window.setTimeout(() => {
        if (this.wanted) this.spawn(Ctor)
      }, 120)
    }
    this.rec = r
    try {
      r.start()
    } catch (err) {
      this.opts.onState?.('error', describeError(String(err)))
    }
  }
}
