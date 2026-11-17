// Records the composited stage canvas plus the microphone with MediaRecorder.

const TYPES = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

export function pickRecordingType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
}

export function recordingExtension(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm'
}

export class SessionRecorder {
  private rec: MediaRecorder
  private video: MediaStream
  private chunks: Blob[] = []
  private done: Promise<Blob | null>

  /** Returns null when recording is not possible in this browser. `onError` fires if the recorder fails later. */
  static create(video: MediaStream, audio: MediaStreamTrack | null, onError: () => void): SessionRecorder | null {
    const type = pickRecordingType()
    if (!type) return null
    try {
      return new SessionRecorder(video, audio, type, onError)
    } catch {
      video.getTracks().forEach((t) => t.stop())
      return null
    }
  }

  private constructor(video: MediaStream, audio: MediaStreamTrack | null, type: string, onError: () => void) {
    this.video = video
    const tracks = [...video.getVideoTracks(), ...(audio ? [audio] : [])]
    this.rec = new MediaRecorder(new MediaStream(tracks), {
      mimeType: type,
      videoBitsPerSecond: 6_000_000,
      audioBitsPerSecond: 128_000,
    })
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.rec.onerror = () => onError()
    this.done = new Promise((resolve) => {
      this.rec.onstop = () => {
        this.video.getTracks().forEach((t) => t.stop()) // only the canvas capture; the camera audio stays live
        const mime = (this.rec.mimeType || type).split(';')[0]
        resolve(this.chunks.length ? new Blob(this.chunks, { type: mime }) : null)
      }
    })
  }

  start() {
    this.rec.start(1000)
  }

  pause() {
    if (this.rec.state === 'recording') this.rec.pause()
  }

  resume() {
    if (this.rec.state === 'paused') this.rec.resume()
  }

  /** Stops and resolves with the whole recording (null if nothing was recorded). */
  stop(): Promise<Blob | null> {
    if (this.rec.state === 'inactive' && !this.chunks.length) {
      // never started (or already failed): onstop will not fire
      this.video.getTracks().forEach((t) => t.stop())
      return Promise.resolve(null)
    }
    if (this.rec.state !== 'inactive') {
      try {
        this.rec.stop()
      } catch {
        this.video.getTracks().forEach((t) => t.stop())
        return Promise.resolve(null)
      }
    }
    return this.done
  }
}
