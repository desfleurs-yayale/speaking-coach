// Camera + microphone access. Shared by all practice modes.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface CameraState {
  stream: MediaStream | null
  error: string | null // Chinese, user-facing
  starting: boolean
  start: () => Promise<MediaStream | null>
  stop: () => void
}

export function describeMediaError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return '没有拿到摄像头/麦克风权限。请在浏览器地址栏左侧允许访问，或到「系统设置 › 隐私与安全性」里给浏览器开权限。'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '没有找到可用的摄像头或麦克风。'
  if (name === 'NotReadableError') return '摄像头正被其他应用占用（例如会议软件），关掉后再试。'
  return `打开摄像头失败：${err instanceof Error ? err.message : String(err)}`
}

/** Opens the front camera (and the microphone when `audio` is true, needed for recording). */
export function useCamera(opts: { audio?: boolean; autoStart?: boolean } = {}): CameraState {
  const { audio = true, autoStart = false } = opts
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStream(null)
  }, [])

  const start = useCallback(async () => {
    if (streamRef.current) return streamRef.current
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前浏览器不支持摄像头访问，请用最新版 Chrome 打开 http://localhost 地址。')
      return null
    }
    setStarting(true)
    setError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
      })
      streamRef.current = s
      setStream(s)
      return s
    } catch (e) {
      setError(describeMediaError(e))
      return null
    } finally {
      setStarting(false)
    }
  }, [audio])

  useEffect(() => {
    if (autoStart) void start()
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [autoStart, start])

  return { stream, error, starting, start, stop }
}
