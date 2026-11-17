// Turns pasted text into lesson sentences. One English sentence per line, optionally followed by a Chinese line
// (its translation). English lines holding several sentences, or whole paragraphs, are split into sentences.
// Pure and import-free at runtime, so `node src/features/shadowing/customText.test.ts` can check it.
import type { LessonLevel, LessonSentence } from '../../lib/types'

const HAN = /[\u3400-\u9fff\uf900-\ufaff]/
const LATIN = /[A-Za-z]/
// English part, then the first Chinese character (or a Chinese opening bracket/quote) on a mixed line.
const MIXED = /^([^\u3400-\u9fff\uf900-\ufaff]*?)\s*([\u3400-\u9fff\uf900-\ufaff（「“].*)$/
const ABBREVIATION = /(?:^|\s)(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|a\.m|p\.m|u\.s)\.$/i
const MAX_WORDS = 28
export const MAX_SENTENCES = 100

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Splits a sentence of more than MAX_WORDS words at the comma or semicolon nearest to its middle. */
function splitLong(s: string): string[] {
  const words = s.split(' ')
  if (words.length <= MAX_WORDS) return [s]
  let cut = -1
  words.forEach((w, i) => {
    if (i < 3 || i > words.length - 4 || !/[,;:]$/.test(w)) return
    if (cut < 0 || Math.abs(i - words.length / 2) < Math.abs(cut - words.length / 2)) cut = i
  })
  if (cut < 0) return [s]
  return [...splitLong(words.slice(0, cut + 1).join(' ')), ...splitLong(words.slice(cut + 1).join(' '))]
}

/** English text -> sentences, split after . ! ? … when the next one starts with a capital, digit or quote. */
export function splitSentences(text: string): string[] {
  const pieces = clean(text).split(/(?<=[.!?…]["'”’)\]]*)\s+(?=["'“‘([]?[A-Z0-9])/)
  const out: string[] = []
  for (const p of pieces) {
    if (out.length && ABBREVIATION.test(out[out.length - 1])) out[out.length - 1] += ` ${p}`
    else out.push(p)
  }
  return out.flatMap(splitLong).filter((s) => LATIN.test(s))
}

function splitChinese(zh: string): string[] {
  return zh
    .split(/(?<=[。！？!?])/)
    .map(clean)
    .filter(Boolean)
}

function pair(english: string, zh: string): { text: string; zh: string }[] {
  const en = splitSentences(english)
  if (!zh) return en.map((text) => ({ text, zh: '' }))
  if (en.length <= 1) return [{ text: clean(english), zh }]
  const zhParts = splitChinese(zh)
  if (zhParts.length === en.length) return en.map((text, i) => ({ text, zh: zhParts[i] }))
  // Cannot tell which Chinese goes with which sentence: keep one subtitle unless it gets too long.
  if (clean(english).split(' ').length <= MAX_WORDS + 12) return [{ text: clean(english), zh }]
  return en.map((text) => ({ text, zh: '' }))
}

export function parseCustomText(input: string): LessonSentence[] {
  const out: { text: string; zh: string }[] = []
  let pending: string | null = null // English line whose translation may come next
  const flush = (zh = '') => {
    if (pending !== null) out.push(...pair(pending, zh))
    pending = null
  }
  for (const raw of input.split(/\r?\n/)) {
    const line = clean(raw)
    if (!line) continue
    const hasHan = HAN.test(line)
    if (hasHan && LATIN.test(line)) {
      const m = MIXED.exec(line)
      if (m && LATIN.test(m[1])) {
        // "Hello there. 你好。" on one line
        flush()
        pending = m[1]
        flush(clean(m[2]))
        continue
      }
    }
    if (hasHan) {
      if (pending !== null) flush(line)
      else if (out.length) out[out.length - 1].zh = clean(`${out[out.length - 1].zh} ${line}`)
      continue
    }
    if (LATIN.test(line)) {
      flush()
      pending = line
    }
  }
  flush()
  return out.slice(0, MAX_SENTENCES).map((s, i) => ({ id: `s${i + 1}`, text: s.text, zh: s.zh }))
}

/** Rough difficulty from the average sentence length. */
export function estimateLevel(sentences: LessonSentence[]): LessonLevel {
  if (!sentences.length) return 1
  const avg = sentences.reduce((n, s) => n + s.text.split(/\s+/).length, 0) / sentences.length
  return avg <= 7 ? 1 : avg <= 13 ? 2 : 3
}
