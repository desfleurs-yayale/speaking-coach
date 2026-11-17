// Local persistence in IndexedDB. Everything stays in this browser.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Lesson, PracticeSession, RecordingBlob, VocabItem } from './types'

interface CoachDB extends DBSchema {
  sessions: { key: string; value: PracticeSession; indexes: { byStart: number } }
  recordings: { key: string; value: RecordingBlob }
  vocab: { key: string; value: VocabItem; indexes: { byAdded: number } }
  customLessons: { key: string; value: Lesson }
}

let dbPromise: Promise<IDBPDatabase<CoachDB>> | null = null

function db() {
  dbPromise ??= openDB<CoachDB>('speaking-coach', 1, {
    upgrade(d) {
      const s = d.createObjectStore('sessions', { keyPath: 'id' })
      s.createIndex('byStart', 'startedAt')
      d.createObjectStore('recordings', { keyPath: 'id' })
      const v = d.createObjectStore('vocab', { keyPath: 'word' })
      v.createIndex('byAdded', 'addedAt')
      d.createObjectStore('customLessons', { keyPath: 'id' })
    },
  })
  return dbPromise
}

/** Notifies pages that local data changed (records / vocab counters refresh on this). */
const CHANGE_EVENT = 'coach-data-changed'
function changed(store: string) {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: store }))
}
export function onDataChanged(cb: (store: string) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<string>).detail)
  window.addEventListener(CHANGE_EVENT, h)
  return () => window.removeEventListener(CHANGE_EVENT, h)
}

export function newId(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Lowercase word key used by the vocabulary book and word matching. */
export function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')
}

// ---- sessions ----
export async function saveSession(s: PracticeSession) {
  await (await db()).put('sessions', s)
  changed('sessions')
}
export async function listSessions(): Promise<PracticeSession[]> {
  const all = await (await db()).getAllFromIndex('sessions', 'byStart')
  return all.reverse()
}
export async function getSession(id: string) {
  return (await db()).get('sessions', id)
}
export async function deleteSession(id: string) {
  const d = await db()
  const s = await d.get('sessions', id)
  if (s?.recordingId) await d.delete('recordings', s.recordingId)
  await d.delete('sessions', id)
  changed('sessions')
}

// ---- recordings ----
export async function saveRecording(r: RecordingBlob) {
  await (await db()).put('recordings', r)
  changed('recordings')
}
export async function getRecording(id: string) {
  return (await db()).get('recordings', id)
}

// ---- vocabulary ----
export async function addVocab(item: Omit<VocabItem, 'addedAt' | 'reviewCount' | 'mastered' | 'word'> & { word: string }) {
  const d = await db()
  const key = normalizeWord(item.word)
  if (!key) return
  const existing = await d.get('vocab', key)
  if (existing) return existing
  const v: VocabItem = { ...item, word: key, addedAt: Date.now(), reviewCount: 0, mastered: false }
  await d.put('vocab', v)
  changed('vocab')
  return v
}
export async function hasVocab(word: string) {
  return (await (await db()).getKey('vocab', normalizeWord(word))) !== undefined
}
export async function listVocab(): Promise<VocabItem[]> {
  const all = await (await db()).getAllFromIndex('vocab', 'byAdded')
  return all.reverse()
}
export async function updateVocab(v: VocabItem) {
  await (await db()).put('vocab', v)
  changed('vocab')
}
export async function deleteVocab(word: string) {
  await (await db()).delete('vocab', word)
  changed('vocab')
}

// ---- custom lessons (pasted by the user) ----
export async function saveCustomLesson(l: Lesson) {
  await (await db()).put('customLessons', { ...l, custom: true })
  changed('customLessons')
}
export async function listCustomLessons(): Promise<Lesson[]> {
  return (await db()).getAll('customLessons')
}
export async function deleteCustomLesson(id: string) {
  await (await db()).delete('customLessons', id)
  changed('customLessons')
}
