// Manifest of dreamcore image assets. Files live in public/assets/dream/.
// The "assets" child generates the images; everyone else reads paths from here.
// Code must keep working when a file is missing: use `fallback` (a CSS gradient) instead.

import type { DreamSceneId } from './types'

export interface DreamScene {
  id: DreamSceneId
  name: string // Chinese display name
  src: string // 16:9 background, 1920x1080 JPEG
  fallback: string // CSS background value used until/unless the image loads
  particle: string // preferred sparkle tint for this scene (CSS color)
}

export const DREAM_SCENES: DreamScene[] = [
  {
    id: 'sky',
    name: '晴空',
    src: '/assets/dream/scenes/sky.jpg',
    fallback: 'linear-gradient(180deg, #3f7fe0 0%, #8fb8f2 55%, #eaf2ff 100%)',
    particle: '#ffffff',
  },
  {
    id: 'meadow',
    name: '草原',
    src: '/assets/dream/scenes/meadow.jpg',
    fallback: 'linear-gradient(180deg, #4d8de6 0%, #a9cdf5 48%, #4f9a3a 52%, #2f6f24 100%)',
    particle: '#fffbe8',
  },
  {
    id: 'ocean',
    name: '闪光海',
    src: '/assets/dream/scenes/ocean.jpg',
    fallback: 'linear-gradient(180deg, #7fb3e8 0%, #c7e0f7 45%, #2c6f9e 55%, #123e66 100%)',
    particle: '#e8f7ff',
  },
  {
    id: 'dusk',
    name: '粉色黄昏',
    src: '/assets/dream/scenes/dusk.jpg',
    fallback: 'linear-gradient(180deg, #f6a6c1 0%, #fbd3b0 55%, #fff1e0 100%)',
    particle: '#fff0f6',
  },
  {
    id: 'night',
    name: '星夜',
    src: '/assets/dream/scenes/night.jpg',
    fallback: 'linear-gradient(180deg, #0b1440 0%, #27326e 60%, #5a4d8f 100%)',
    particle: '#dfe6ff',
  },
]

export function getScene(id: DreamSceneId): DreamScene {
  return DREAM_SCENES.find((s) => s.id === id) ?? DREAM_SCENES[0]
}

// Small floating "memory cards" (4:3, 640x480 JPEG) that drift around the user.
export const DREAM_CARDS: string[] = Array.from(
  { length: 10 },
  (_, i) => `/assets/dream/cards/card-${String(i + 1).padStart(2, '0')}.jpg`,
)

// MediaPipe runtime files, served locally from public/.
export const MEDIAPIPE = {
  wasmBase: '/mediapipe/wasm',
  handModel: '/models/hand_landmarker.task',
  segmenterModel: '/models/selfie_segmenter.tflite',
}
