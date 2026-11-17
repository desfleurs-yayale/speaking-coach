// Fetches the local runtime files the camera effects need (they are gitignored):
//   public/mediapipe/wasm/*   copied from node_modules/@mediapipe/tasks-vision/wasm
//   public/models/*.task|tflite downloaded once from Google's MediaPipe model bucket
// Run with `npm run setup` after `npm install`. Existing files are kept.
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODELS = {
  'hand_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'selfie_segmenter.tflite':
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
}

async function exists(path) {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

async function copyWasm() {
  const from = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
  const to = join(root, 'public/mediapipe/wasm')
  await mkdir(to, { recursive: true })
  for (const name of await readdir(from)) {
    await copyFile(join(from, name), join(to, name))
  }
  console.log('copied MediaPipe wasm to public/mediapipe/wasm')
}

async function downloadModels() {
  const dir = join(root, 'public/models')
  await mkdir(dir, { recursive: true })
  for (const [name, url] of Object.entries(MODELS)) {
    const target = join(dir, name)
    if (await exists(target)) {
      console.log(`kept public/models/${name}`)
      continue
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`download failed for ${name}: HTTP ${res.status}`)
    await writeFile(target, Buffer.from(await res.arrayBuffer()))
    console.log(`downloaded public/models/${name}`)
  }
}

await copyWasm()
await downloadModels()
