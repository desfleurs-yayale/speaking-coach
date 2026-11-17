// Loads data from IndexedDB and reloads it whenever one of the given stores changes (see db.onDataChanged).
import { useCallback, useEffect, useRef, useState } from 'react'
import { onDataChanged } from './db'

export interface LiveData<T> {
  data: T | undefined
  loading: boolean
  error?: string
  reload: () => void
}

export function useLiveData<T>(load: () => Promise<T>, stores: readonly string[]): LiveData<T> {
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error?: string }>({
    data: undefined,
    loading: true,
  })
  const [tick, setTick] = useState(0)
  const loadRef = useRef(load)
  const key = stores.join(',')

  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    const watched = key.split(',')
    return onDataChanged((store) => {
      if (watched.includes(store)) setTick((t) => t + 1)
    })
  }, [key])

  useEffect(() => {
    let alive = true
    loadRef.current().then(
      (data) => alive && setState({ data, loading: false }),
      (err: unknown) =>
        alive && setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) })),
    )
    return () => {
      alive = false
    }
  }, [tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}
