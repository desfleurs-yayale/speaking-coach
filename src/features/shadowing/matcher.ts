// Pure word matcher for shadowing: aligns what the recogniser heard with the words of the sentence.
// No imports and only erasable TypeScript, so the self-check runs under plain node:
//   node src/features/shadowing/matcher.test.ts

/** Accepted spellings of one spoken unit, e.g. ['is', 'has'] for the "'s" of "it's". */
export type Atom = string[]

/** One spoken unit. A contraction such as "you're" becomes two units ([you] [are]). */
export interface Unit {
  atom: Atom
  /** Only on the first unit of a multi-unit token: spellings of the whole token ("you're", "your"). */
  whole?: Atom
  /** Units in the token this unit starts (1 for plain words, 0 for non-first units). */
  span: number
}

export interface ExpectedWord {
  index: number // position in the sentence's word list
  display: string // as written, punctuation included ("morning!")
  units: Unit[] // empty for pure punctuation ("—"), which never needs to be hit
}

export interface MatchOptions {
  lookAhead?: number // expected units that may be skipped between two matches for free, default 3
  minSimilarity?: number // Levenshtein similarity accepted for words longer than 3 letters, default 0.75
}

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
]

// Words that sound the same, so the recogniser may write any of them. Each word appears in one group only.
const HOMOPHONE_GROUPS = [
  ['to', 'too', 'two'], ['for', 'four'], ['there', 'their', "they're"], ['your', "you're"], ['its', "it's"],
  ['whose', "who's"], ['were', "we're"], ['lets', "let's"], ['right', 'write'], ['by', 'buy', 'bye'],
  ['no', 'know'], ['here', 'hear'], ['see', 'sea'], ['one', 'won'], ['eight', 'ate'], ['new', 'knew'],
  ['our', 'hour'], ['where', 'wear'], ['weather', 'whether'], ['whole', 'hole'], ['meet', 'meat'],
  ['week', 'weak'], ['flour', 'flower'], ['piece', 'peace'], ['wait', 'weight'], ['through', 'threw'],
  ['blue', 'blew'], ['son', 'sun'], ['aloud', 'allowed'], ['which', 'witch'], ['would', 'wood'],
  ['be', 'bee'], ['tea', 'tee'], ['night', 'knight'], ['sale', 'sail'], ['made', 'maid'], ['mail', 'male'],
  ['plain', 'plane'], ['break', 'brake'], ['pair', 'pear'], ['dear', 'deer'], ['fair', 'fare'],
  ['hi', 'high'], ['way', 'weigh'], ['seen', 'scene'], ['tail', 'tale'],
]
const HOMOPHONES = new Map<string, string[]>()
for (const group of HOMOPHONE_GROUPS) for (const w of group) HOMOPHONES.set(w, group)

const IRREGULAR: Record<string, Atom[]> = {
  "can't": [['can'], ['not']],
  cannot: [['can'], ['not']],
  "won't": [['will'], ['not']],
  "shan't": [['shall'], ['not']],
  "ain't": [['am', 'is', 'are'], ['not']],
  "let's": [['let'], ['us']],
  gonna: [['going'], ['to']],
  wanna: [['want'], ['to']],
  gotta: [['got'], ['to']],
}

const SUFFIXES: [string, Atom][] = [
  ["n't", ['not']],
  ["'re", ['are']],
  ["'ve", ['have']],
  ["'ll", ['will']],
  ["'d", ['would', 'had']],
  ["'m", ['am']],
]

// Stems whose "'s" means "is" or "has"; any other "x's" is treated as a possessive.
const IS_HAS_STEMS = new Set([
  'it', 'that', 'what', 'there', 'here', 'he', 'she', 'who', 'where', 'how', 'when', 'why', 'this',
  'everyone', 'everything', 'everybody', 'someone', 'something', 'somebody', 'nobody', 'nothing', 'one',
])

/** Lowercase, no diacritics, unified apostrophes, only [a-z0-9'] kept ("Well-known," -> "wellknown"). */
export function normalizeToken(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'")
    .replace(/[^a-z0-9']+/g, '')
    .replace(/^'+|'+$/g, '')
}

function canonical(form: string): string {
  if (/^\d+$/.test(form) && Number(form) <= 20) return NUMBER_WORDS[Number(form)]
  return form === 'ok' ? 'okay' : form
}

/** Expands a normalized token into spoken units: "i'm" -> [i][am], "it's" -> [it][is|has], "5" -> [five]. */
export function expandToken(norm: string): Atom[] {
  if (!norm) return []
  const irregular = IRREGULAR[norm]
  if (irregular) return irregular.map((a) => [...a])
  for (const [suffix, atom] of SUFFIXES) {
    if (norm.length > suffix.length && norm.endsWith(suffix)) {
      return [[canonical(norm.slice(0, -suffix.length))], [...atom]]
    }
  }
  if (norm.length > 2 && norm.endsWith("'s")) {
    const stem = norm.slice(0, -2)
    if (IS_HAS_STEMS.has(stem)) return [[stem], ['is', 'has']]
    return [[norm, `${stem}s`, stem]] // possessive: the recogniser may write "tom's", "toms" or "tom"
  }
  return [[canonical(norm)]]
}

/** Splits a sentence into display words; dashes, slashes and "..." between words also separate. */
export function splitWords(text: string): string[] {
  return text
    .split(/\s+/)
    .flatMap((t) => t.split(/(?<=[\u2014\u2013/\u2026]|\.{3})(?=.)/))
    .filter(Boolean)
}

function withHomophones(atom: Atom): Atom {
  const out = new Set(atom)
  for (const form of atom) for (const h of HOMOPHONES.get(form) ?? []) out.add(h)
  return [...out]
}

function unitsOf(token: string, homophones: boolean): Unit[] {
  const raw = token.trim() === '&' ? 'and' : token
  const norm = normalizeToken(raw)
  // Hyphenated words are spoken as separate units ("well-known" -> [well][known]); `whole` keeps "wellknown".
  const atoms = raw.split(/[-\u2010\u2011]/).map(normalizeToken).flatMap(expandToken)
  const fix = homophones ? withHomophones : (a: Atom) => a
  return atoms.map((atom, i) => ({
    atom: fix(atom),
    whole: i === 0 && atoms.length > 1 ? fix([norm]) : undefined,
    span: i === 0 ? atoms.length : 0,
  }))
}

export function tokenizeSentence(text: string): ExpectedWord[] {
  return splitWords(text).map((display, index) => ({ index, display, units: unitsOf(display, true) }))
}

export function tokenizeTranscript(text: string): Unit[] {
  return splitWords(text).flatMap((t) => unitsOf(t, false))
}

export function isScorable(w: ExpectedWord): boolean {
  return w.units.length > 0
}

export function scorableCount(words: ExpectedWord[]): number {
  return words.filter(isScorable).length
}

/** True when every scorable word is in `hits` (and there is at least one). */
export function isComplete(words: ExpectedWord[], hits: ReadonlySet<number>): boolean {
  const scorable = words.filter(isScorable)
  return scorable.length > 0 && scorable.every((w) => hits.has(w.index))
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** 1 - editDistance / longerLength, in 0..1. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length)
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max
}

function overlaps(a: Atom, b: Atom): boolean {
  return a.some((x) => b.includes(x))
}

/** Close spelling; only expected words longer than 3 letters may match this way. */
function fuzzy(expected: Atom, heard: Atom, minSim: number): boolean {
  return expected.some((e) => e.length > 3 && heard.some((h) => similarity(e, h) >= minSim))
}

/**
 * Indices of the words heard in `transcript` (the caller keeps earlier hits; this only reports the current text).
 * Heard units are aligned to expected units in order. A heard unit may match one of the next `lookAhead + 1`
 * expected units, exact before fuzzy and nearest first, so a skipped word does not block the rest. Outside that
 * window (further ahead, or back when the user re-reads) a match is only taken when it is confirmed by the next
 * unit as well, or when it is an exact match of a not-yet-hit word of 4+ letters. Unmatched heard units (fillers,
 * noise) are ignored. Contractions match their expansion, and compounds match both ways ("every day" / "everyday").
 */
export function matchTranscript(words: ExpectedWord[], transcript: string, opts: MatchOptions = {}): Set<number> {
  const lookAhead = opts.lookAhead ?? 3
  const minSim = opts.minSimilarity ?? 0.75
  const exp = words.flatMap((w) => w.units.map((unit) => ({ word: w.index, unit })))
  const heard = tokenizeTranscript(transcript)
  const unitHit = new Array<boolean>(exp.length).fill(false)

  // Exact alignment of heard[j] at exp[k]: [expected units used, heard units used], or null.
  const exactAt = (k: number, j: number): [number, number] | null => {
    const e = exp[k].unit
    const h = heard[j]
    if (overlaps(e.atom, h.atom)) return [1, 1]
    if (e.whole && overlaps(e.whole, h.atom)) return [e.span, 1] // "you're" heard as "your"
    if (h.whole && overlaps(e.atom, h.whole)) return [1, h.span] // "your" heard as "you're"
    const nextE = exp[k + 1]
    if (nextE && h.atom.includes(e.atom[0] + nextE.unit.atom[0])) return [2, 1] // "every day" heard as "everyday"
    const nextH = heard[j + 1]
    if (nextH && e.atom.includes(h.atom[0] + nextH.atom[0])) return [1, 2] // "everyday" heard as "every day"
    return null
  }

  // Where heard[j] goes: { at: expected index, e: expected units used, h: heard units used }.
  const place = (cursor: number, j: number): { at: number; e: number; h: number } | null => {
    const end = Math.min(cursor + lookAhead, exp.length - 1)
    for (let i = cursor; i <= end; i++) {
      const u = exactAt(i, j)
      if (u) return { at: i, e: u[0], h: u[1] }
    }
    for (let i = cursor; i <= end; i++) {
      if (fuzzy(exp[i].unit.atom, heard[j].atom, minSim)) return { at: i, e: 1, h: 1 }
    }
    const far: number[] = []
    for (let i = end + 1; i < exp.length; i++) far.push(i)
    for (let i = cursor - 1; i >= 0; i--) far.push(i)
    for (const i of far) {
      const u = exactAt(i, j)
      if (!u) continue
      const [ne, nh] = [i + u[0], j + u[1]]
      const confirmed =
        ne < exp.length && nh < heard.length && (exactAt(ne, nh) || fuzzy(exp[ne].unit.atom, heard[nh].atom, minSim))
      const distinctive =
        u[0] === 1 && u[1] === 1 && exp[i].unit.span === 1 && !unitHit[i] && exp[i].unit.atom[0].length >= 4
      if (confirmed || distinctive) return { at: i, e: u[0], h: u[1] }
    }
    return null
  }

  let cursor = 0
  let j = 0
  while (j < heard.length) {
    const p = place(cursor, j)
    if (!p) {
      j++
      continue
    }
    for (let u = p.at; u < p.at + p.e; u++) unitHit[u] = true
    cursor = p.at + p.e
    j += p.h
  }

  const hits = new Set<number>()
  for (const w of words) {
    if (isScorable(w) && exp.every((s, i) => s.word !== w.index || unitHit[i])) hits.add(w.index)
  }
  return hits
}
