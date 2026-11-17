// Text-to-speech with the system English voices (macOS ships good ones such as Samantha / Ava).

let cachedVoice: SpeechSynthesisVoice | null = null

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  const voices = window.speechSynthesis?.getVoices() ?? []
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
  const preferred = ['Ava', 'Samantha', 'Allison', 'Google US English', 'Karen', 'Daniel']
  for (const name of preferred) {
    const v = en.find((x) => x.name.includes(name))
    if (v) return (cachedVoice = v)
  }
  cachedVoice = en.find((v) => v.lang === 'en-US') ?? en[0] ?? null
  return cachedVoice
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null
    pickVoice()
  }
}

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Speaks English text. Resolves when finished or cancelled. */
export function speak(text: string, opts: { rate?: number; onBoundary?: (charIndex: number) => void } = {}) {
  return new Promise<void>((resolve) => {
    if (!isTtsSupported()) return resolve()
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const v = pickVoice()
    if (v) u.voice = v
    u.lang = v?.lang ?? 'en-US'
    u.rate = opts.rate ?? 0.95
    u.onend = () => resolve()
    u.onerror = () => resolve()
    if (opts.onBoundary) u.onboundary = (e) => opts.onBoundary?.(e.charIndex)
    window.speechSynthesis.speak(u)
  })
}

export function stopSpeaking() {
  if (isTtsSupported()) window.speechSynthesis.cancel()
}
