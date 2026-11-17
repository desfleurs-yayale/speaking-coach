// Public contract of the dreamcore effects engine (src/effects/).
// Owner: the "effects" child. Consumers (shadowing, future dialogue) import ONLY from 'src/effects'.
// Changes must stay backward compatible (additive); announce any change to the parent and to "shadowing".
//
// Coordinate system for every position in this file: normalized STAGE coordinates as the user sees them,
// x and y in 0..1, origin top-left of the stage element, AFTER mirroring (if mirrored, the user's right
// hand appears on the left of the screen and is reported with small x).

import type { ReactNode } from 'react'
import type { DreamSceneId } from '../lib/types'

export type BackgroundMode =
  | 'off' // plain camera picture, no background replacement
  | 'on' // dream scene always replaces the room behind the user
  | 'gesture' // starts off; raising both open palms fades the dream scene in, lowering both hands for ~1.5s fades it out

export interface DreamStageProps {
  stream: MediaStream | null // camera stream from useCamera(); null shows the scene/fallback only
  scene: DreamSceneId
  backgroundMode?: BackgroundMode // default 'on'
  mirrored?: boolean // default true (selfie view)
  showHands?: boolean // draw the thin hand skeleton, default true
  grain?: boolean // film grain + soft-focus overlay, default true
  ambientSparkles?: boolean // slow idle sparkles drifting upward, default true
  className?: string
  style?: React.CSSProperties
  children?: ReactNode // DOM overlay rendered above the canvas (e.g. live subtitles), pointer-events allowed
  onReady?: (handle: DreamStageHandle) => void // called once the handle is usable (before models finish loading)
  onStatus?: (status: StageStatus) => void
}

export interface StageStatus {
  phase: 'idle' | 'loading-models' | 'running' | 'error'
  segmentation: boolean // true when person segmentation is active
  hands: boolean // true when hand tracking is active
  fps: number
  error?: string
}

export interface HandPoint {
  x: number
  y: number
}

export interface TrackedHand {
  handedness: 'Left' | 'Right' // the user's real hand
  landmarks: HandPoint[] // 21 MediaPipe landmarks in stage coordinates
  pinching: boolean
  pinchPoint: HandPoint // midpoint between thumb tip and index tip
  openPalm: boolean
}

export interface PinchEvent {
  phase: 'start' | 'move' | 'end'
  hand: 'Left' | 'Right'
  x: number
  y: number
}

export type GestureEvent = 'hands-up' | 'hands-down'

export interface BurstOptions {
  x: number
  y: number
  count?: number // default ~40
  color?: string // CSS color, default the scene's particle tint
  spread?: number // radius in stage-normalized units, default 0.04
}

export interface FountainOptions {
  x: number // center x of the fountain base
  width?: number // normalized width of the base, default 0.15
  durationMs?: number // default 1600
  color?: string
}

export interface CardOptions {
  src: string // image url, usually from DREAM_CARDS
  x: number
  y: number
  widthRatio?: number // card width relative to stage width, default 0.16
  durationMs?: number // time before it fades out, default 6000; 0 = stays until clearCards()
}

// Draws extra content into the composited frame every animation frame, after particles and before grain.
// Use it for anything that must appear in recordings (the DOM `children` overlay is NOT recorded).
// ctx is in device pixels; width/height are the canvas pixel size; t is performance.now().
export type OverlayRenderer = (ctx: CanvasRenderingContext2D, width: number, height: number, t: number) => void

export interface DreamStageHandle {
  burst(opts: BurstOptions): void // star-shaped glitter explosion that rises and fades
  fountain(opts: FountainOptions): void // glitter spraying upward like the reference video
  flyBirds(count?: number): void // a small flock of white birds/paper planes crosses the sky behind the user
  showCard(opts: CardOptions): void // floating translucent memory card
  clearCards(): void
  setScene(id: DreamSceneId): void // cross-fade to another scene
  setBackgroundActive(active: boolean): void // manual override for 'gesture' mode
  getHands(): TrackedHand[] // latest tracked hands, [] if none
  onPinch(cb: (e: PinchEvent) => void): () => void // returns unsubscribe
  onGesture(cb: (g: GestureEvent) => void): () => void
  setOverlayRenderer(fn: OverlayRenderer | null): void
  toStage(clientX: number, clientY: number): HandPoint // convert DOM client coords to stage coords
  fromStage(p: HandPoint): { clientX: number; clientY: number }
  captureStream(fps?: number): MediaStream // video track of the composited canvas (add your own audio track)
  getCanvas(): HTMLCanvasElement | null
}
