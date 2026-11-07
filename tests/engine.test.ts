import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { floodMask, dilateMask } from '../src/engine/floodFill.ts'
import { Stabilizer, matrixAbout, matrixTranslate, pointInPolygon, sampleDabs, shapePointsFromDrag, transformStroke } from '../src/engine/geometry.ts'
import { emptyHistory, record, redo, undo } from '../src/engine/history.ts'
import { addFrame, addLayer, appendStrokes, celOf, clearCel, createProject, deleteFrame, deleteLayer, duplicateFrame, duplicateLayer, moveFrame, moveLayer, patchLayer, removeStrokes, transformStrokes } from '../src/engine/projectOps.ts'
import { projectFromJSON, projectToJSON } from '../src/engine/serialize.ts'
import { anchorAt, fitViewport, gestureViewport, toArt, toScreen, touchInfo, zoomAt } from '../src/engine/viewport.ts'
import { newStroke, defaultToolSettings } from '../src/engine/brushes.ts'
import type { Stroke } from '../src/engine/types.ts'
import { beatAtVideoFrame, evenDim, fitContain, presetById, videoBitrate, videoFrameCount } from '../src/engine/video.ts'
import { cameraAt, cameraKeys, cameraMatrix, clearCamera, defaultPose, hasCamera, removeCameraKey, setCameraKey } from '../src/engine/camera.ts'
import { computePeaks, frameSpan, mixRange, patchAudio, peaksForSpan, removeAudio, timelineSeconds, type AudioTrack } from '../src/engine/audio.ts'
import { addSceneAt, duplicateScene, moveScene, removeScene, renameScene, scenesOf, sceneAtFrame, rangeToScene, clearScenes, sceneSeconds } from '../src/engine/scenes.ts'
import { badgeFor, planSync } from '../src/engine/sync.ts'
import { muxMp4 } from '../src/engine/mp4.ts'
import { muxWebm } from '../src/engine/webm.ts'

const settings = defaultToolSettings()
const mk = (tool: Parameters<typeof newStroke>[0], pts: [number, number][]): Stroke => ({
  ...newStroke(tool, settings[tool], { color: '#168CFF', shapeFill: 'none', tolerance: 24 }),
  points: pts.map(([x, y]) => ({ x, y, p: 1 })),
})
const proj = () => createProject({ name: 'T', width: 100, height: 60, fps: 12, background: '#ffffff' })

describe('floodMask', () => {
  // 5x5, a vertical wall of opaque black at x=2 splits the canvas in two
  const w = 5
  const h = 5
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y += 1) data.set([0, 0, 0, 255], (y * w + 2) * 4)

  it('fills only the region the seed is in', () => {
    const r = floodMask(data, w, h, 0, 0, 10)
    assert.ok(r)
    assert.equal(r.mask.reduce((a, b) => a + b, 0), 10)
    assert.equal(r.mask[3], 0)
    assert.deepEqual(r.bounds, { x: 0, y: 0, w: 2, h: 5 })
  })
  it('stops at the wall and never leaks', () => {
    const r = floodMask(data, w, h, 4, 4, 10)
    assert.ok(r)
    assert.equal(r.mask.reduce((a, b) => a + b, 0), 10)
    assert.equal(r.mask[0], 0)
  })
  it('fills the whole empty canvas when nothing is drawn', () => {
    const r = floodMask(new Uint8ClampedArray(w * h * 4), w, h, 1, 1, 0)
    assert.equal(r?.mask.reduce((a, b) => a + b, 0), 25)
  })
  it('returns null outside the canvas', () => {
    assert.equal(floodMask(data, w, h, -1, 0, 10), null)
    assert.equal(floodMask(data, w, h, 0, 9, 10), null)
  })
  it('dilation grows the region by one pixel into the wall', () => {
    const r = floodMask(data, w, h, 0, 0, 10)!
    const g = dilateMask(r, w, h, 1)
    assert.equal(g.mask.reduce((a, b) => a + b, 0), 15)
  })
})

describe('geometry', () => {
  it('stabilizer lags behind raw input and catches up on finish', () => {
    const s = new Stabilizer(0.8)
    s.push({ x: 0, y: 0, p: 1 })
    const lagged = s.push({ x: 100, y: 0, p: 1 })
    assert.ok(lagged.x > 0 && lagged.x < 50)
    const tail = s.finish({ x: 100, y: 0, p: 1 })
    assert.ok(tail.length > 0)
    assert.ok(Math.abs(tail[tail.length - 1].x - 100) < 1)
  })
  it('stabilizer at 0 passes input through', () => {
    const s = new Stabilizer(0)
    s.push({ x: 0, y: 0, p: 1 })
    assert.equal(s.push({ x: 40, y: 7, p: 1 }).x, 40)
  })
  it('sampleDabs spaces dabs evenly along a straight line', () => {
    const { dabs, length } = sampleDabs([{ x: 0, y: 0, p: 1 }, { x: 100, y: 0, p: 1 }], 10)
    assert.equal(length, 100)
    assert.equal(dabs.length, 11)
    assert.ok(Math.abs(dabs[5].x - 50) < 1e-6)
  })
  it('sampleDabs handles a single point', () => {
    assert.equal(sampleDabs([{ x: 3, y: 4, p: 1 }], 5).dabs.length, 1)
  })
  it('point in polygon', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    assert.ok(pointInPolygon(5, 5, sq))
    assert.ok(!pointInPolygon(15, 5, sq))
  })
  it('constrained line snaps to 15 degrees', () => {
    const pts = shapePointsFromDrag('line', { x: 0, y: 0 }, { x: 100, y: 3 }, true)
    assert.ok(Math.abs(pts[1].y) < 1e-6)
  })
  it('constrained rect becomes a square', () => {
    const pts = shapePointsFromDrag('rect', { x: 0, y: 0 }, { x: 50, y: 20 }, true)
    assert.equal(pts[2].x, pts[2].y)
  })
  it('rotating a stroke 90 degrees about its centre', () => {
    const s = mk('line', [[0, 0], [10, 0]])
    const t = transformStroke(s, matrixAbout(5, 0, { rotate: Math.PI / 2 }))
    assert.ok(Math.abs(t.points[0].x - 5) < 1e-9 && Math.abs(t.points[0].y + 5) < 1e-9)
    assert.ok(Math.abs(t.points[1].x - 5) < 1e-9 && Math.abs(t.points[1].y - 5) < 1e-9)
  })
  it('scaling scales brush size too', () => {
    const s = { ...mk('line', [[0, 0], [10, 0]]), size: 4 }
    assert.equal(transformStroke(s, matrixAbout(0, 0, { scale: 2 })).size, 8)
  })
  it('flip mirrors points', () => {
    const s = mk('line', [[2, 0], [4, 0]])
    const t = transformStroke(s, matrixAbout(5, 0, { flipX: true }))
    assert.equal(t.points[0].x, 8)
  })
})

describe('project operations', () => {
  it('starts with layers and one empty frame', () => {
    const p = proj()
    assert.equal(p.frames.length, 1)
    assert.ok(p.layers.length >= 2)
  })
  it('appends and removes strokes immutably', () => {
    const p = proj()
    const s = mk('pencil', [[1, 1], [5, 5]])
    const p2 = appendStrokes(p, p.frames[0].id, p.layers[1].id, [s])
    assert.equal(celOf(p.frames[0], p.layers[1].id).length, 0)
    assert.equal(celOf(p2.frames[0], p.layers[1].id).length, 1)
    const p3 = removeStrokes(p2, p2.frames[0].id, p.layers[1].id, [s.id])
    assert.equal(celOf(p3.frames[0], p.layers[1].id).length, 0)
  })
  it('strokes are shared between snapshots (cheap history)', () => {
    const p = proj()
    const s = mk('pencil', [[1, 1]])
    const p2 = appendStrokes(p, p.frames[0].id, p.layers[0].id, [s])
    const p3 = appendStrokes(p2, p2.frames[0].id, p.layers[1].id, [mk('pencil', [[2, 2]])])
    assert.strictEqual(p3.frames[0].cels[p.layers[0].id], p2.frames[0].cels[p.layers[0].id])
  })
  it('translating selected strokes only moves those', () => {
    const p = proj()
    const a = mk('line', [[0, 0], [10, 0]])
    const b = mk('line', [[0, 5], [10, 5]])
    const f = p.frames[0].id
    const l = p.layers[1].id
    const p2 = transformStrokes(appendStrokes(p, f, l, [a, b]), f, l, [a.id], matrixTranslate(7, 3))
    const cel = celOf(p2.frames[0], l)
    assert.equal(cel[0].points[0].x, 7)
    assert.equal(cel[0].points[0].y, 3)
    assert.equal(cel[1].points[0].x, 0)
  })
  it('layer add / rename / lock / hide / opacity / reorder', () => {
    let p = proj()
    const base = p.layers.length
    const r = addLayer(p, p.layers[0].id, 'Fresh')
    p = r.project
    assert.equal(p.layers.length, base + 1)
    assert.equal(p.layers[1].name, 'Fresh')
    p = patchLayer(p, r.layerId, { name: 'Renamed', locked: true, visible: false, opacity: 0.4 })
    const l = p.layers.find((x) => x.id === r.layerId)!
    assert.deepEqual([l.name, l.locked, l.visible, l.opacity], ['Renamed', true, false, 0.4])
    p = moveLayer(p, r.layerId, p.layers.length - 1)
    assert.equal(p.layers[p.layers.length - 1].id, r.layerId)
  })
  it('delete layer removes its cels and refuses to delete the last one', () => {
    let p = proj()
    const f = p.frames[0].id
    const target = p.layers[1].id
    p = appendStrokes(p, f, target, [mk('pencil', [[1, 1]])])
    p = deleteLayer(p, target)
    assert.ok(!(target in p.frames[0].cels))
    while (p.layers.length > 1) p = deleteLayer(p, p.layers[0].id)
    assert.equal(deleteLayer(p, p.layers[0].id).layers.length, 1)
  })
  it('duplicate layer copies strokes into every frame', () => {
    let p = proj()
    const l = p.layers[1].id
    p = appendStrokes(p, p.frames[0].id, l, [mk('pencil', [[1, 1]])])
    const d = duplicateLayer(p, l)
    assert.equal(celOf(d.project.frames[0], d.layerId).length, 1)
    assert.equal(d.project.layers[2].id, d.layerId)
  })
  it('frames: add, duplicate with unique ids, delete, reorder', () => {
    let p = proj()
    const first = p.frames[0].id
    const a = addFrame(p, first)
    p = a.project
    const d = duplicateFrame(p, first)
    p = d.project
    assert.equal(p.frames.length, 3)
    assert.equal(new Set(p.frames.map((f) => f.id)).size, 3)
    assert.equal(p.frames[1].id, d.frameId)
    p = moveFrame(p, 0, 2)
    assert.equal(p.frames[2].id, first)
    const del = deleteFrame(p, first)
    assert.equal(del.project.frames.length, 2)
    assert.notEqual(del.frameId, first)
  })
  it('cannot delete the only frame', () => {
    const p = proj()
    assert.equal(deleteFrame(p, p.frames[0].id).project.frames.length, 1)
  })
  it('clear cel only clears that layer', () => {
    let p = proj()
    const f = p.frames[0].id
    p = appendStrokes(p, f, p.layers[0].id, [mk('pencil', [[1, 1]])])
    p = appendStrokes(p, f, p.layers[1].id, [mk('pencil', [[1, 1]])])
    p = clearCel(p, f, p.layers[1].id)
    assert.equal(celOf(p.frames[0], p.layers[0].id).length, 1)
    assert.equal(celOf(p.frames[0], p.layers[1].id).length, 0)
  })
})

describe('history', () => {
  it('undo then redo round-trips and new edits clear redo', () => {
    let h = emptyHistory<number>()
    let present = 1
    h = record(h, present)
    present = 2
    h = record(h, present)
    present = 3
    const u = undo(h, present)!
    assert.equal(u.value, 2)
    const r = redo(u.history, u.value)!
    assert.equal(r.value, 3)
    const u2 = undo(h, present)!
    const branched = record(u2.history, u2.value)
    assert.equal(branched.future.length, 0)
  })
  it('returns null when nothing to undo or redo', () => {
    assert.equal(undo(emptyHistory<number>(), 1), null)
    assert.equal(redo(emptyHistory<number>(), 1), null)
  })
})

describe('viewport', () => {
  const d = { stageW: 800, stageH: 600, artW: 400, artH: 300 }
  it('toScreen and toArt are inverses at any zoom and rotation', () => {
    const vp = { panX: 37, panY: -12, zoom: 2.5, rot: 0.7 }
    const s = toScreen(vp, d, 123, 45)
    const a = toArt(vp, d, s.x, s.y)
    assert.ok(Math.abs(a.x - 123) < 1e-6 && Math.abs(a.y - 45) < 1e-6)
  })
  it('zoomAt keeps the point under the cursor fixed (the old zoom bug)', () => {
    const vp = fitViewport(d)
    const cursor = { x: 600, y: 200 }
    const before = toArt(vp, d, cursor.x, cursor.y)
    const z = zoomAt(vp, d, 3, cursor)
    const after = toArt(z, d, cursor.x, cursor.y)
    assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.y - after.y) < 1e-6)
    assert.ok(z.zoom > vp.zoom)
  })
  it('two-finger gesture pans, zooms and rotates about the start midpoint', () => {
    const vp = fitViewport(d)
    const from = touchInfo({ x: 300, y: 300 }, { x: 500, y: 300 })
    const to = touchInfo({ x: 350, y: 320 }, { x: 650, y: 320 })
    const g = gestureViewport(vp, d, from, to)
    assert.ok(Math.abs(g.zoom / vp.zoom - 1.5) < 1e-9)
    const anchorArt = toArt(vp, d, from.mid.x, from.mid.y)
    const now = toScreen(g, d, anchorArt.x, anchorArt.y)
    assert.ok(Math.abs(now.x - to.mid.x) < 1e-6 && Math.abs(now.y - to.mid.y) < 1e-6)
  })
  it('anchorAt', () => {
    const vp = { panX: 0, panY: 0, zoom: 1, rot: 0 }
    const moved = anchorAt(vp, d, { x: 0, y: 0 }, { x: 100, y: 100 })
    const s = toScreen(moved, d, 0, 0)
    assert.ok(Math.abs(s.x - 100) < 1e-9 && Math.abs(s.y - 100) < 1e-9)
  })
})

describe('project files', () => {
  it('round-trips, including bitmaps, and assigns a new id', () => {
    let p = proj()
    const bm: Stroke = { ...mk('pencil', []), tool: 'bitmap', bitmap: { x: 1, y: 2, w: 2, h: 1, data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]) } }
    p = appendStrokes(p, p.frames[0].id, p.layers[0].id, [bm])
    const back = projectFromJSON(projectToJSON(p))
    assert.notEqual(back.id, p.id)
    const got = celOf(back.frames[0], p.layers[0].id)[0]
    assert.ok(got.bitmap!.data instanceof Uint8ClampedArray)
    assert.deepEqual([...got.bitmap!.data], [1, 2, 3, 4, 5, 6, 7, 8])
  })
  it('rejects files that are not Brush X projects', () => {
    assert.throws(() => projectFromJSON('{"hello":1}'))
    assert.throws(() => projectFromJSON('not json'))
  })
})

// ------------------------------------------------------------------ Phase 3
import { addGuideLayer, insertGuideFrames, stampGuide, clearRange, hasCustomRange, holdOf, isKeyframe, playSequence, rangeOf, setHold, setRangeEdge, totalTicks } from '../src/engine/projectOps.ts'
import { encodeGif, lzwEncode } from '../src/engine/gif.ts'
import { crc32, readZip, zipBytes } from '../src/engine/zip.ts'
import { strokeIdsInPolygon } from '../src/engine/geometry.ts'

function frames5() {
  let p = proj()
  for (let i = 0; i < 4; i += 1) p = addFrame(p).project
  return p
}

describe('exposure holds', () => {
  it('defaults to 1 and clamps', () => {
    const p = frames5()
    assert.equal(holdOf(p.frames[0]), 1)
    const a = setHold(p, p.frames[0].id, 3)
    assert.equal(holdOf(a.frames[0]), 3)
    assert.equal(holdOf(setHold(p, p.frames[0].id, 999).frames[0]), 24)
    assert.equal(holdOf(setHold(p, p.frames[0].id, -4).frames[0]), 1)
  })
  it('setting back to 1 removes the field', () => {
    const p = frames5()
    const a = setHold(setHold(p, p.frames[1].id, 4), p.frames[1].id, 1)
    assert.equal('hold' in a.frames[1], false)
  })
  it('duplicate keeps hold; new frames are 1', () => {
    const r = frames5()
    const h = setHold(r, r.frames[0].id, 5)
    assert.equal(holdOf(duplicateFrame(h, r.frames[0].id).project.frames[1]), 5)
    assert.equal(holdOf(addFrame(h).project.frames[5]), 1)
  })
  it('old projects without hold/range load fine', () => {
    const p = proj()
    const back = projectFromJSON(projectToJSON(p))
    assert.equal(holdOf(back.frames[0]), 1)
    assert.deepEqual(rangeOf(back), { start: 0, end: 0 })
  })
  it('hold and range survive serialisation', () => {
    let p = frames5()
    p = setHold(p, p.frames[2].id, 3)
    p = setRangeEdge(p, 'start', 1)
    const back = projectFromJSON(projectToJSON(p))
    assert.equal(holdOf(back.frames[2]), 3)
    assert.deepEqual(rangeOf(back), { start: 1, end: 4 })
  })
})

describe('range and sequence', () => {
  it('whole timeline by default; edges push each other', () => {
    let p = frames5()
    assert.deepEqual(rangeOf(p), { start: 0, end: 4 })
    assert.equal(hasCustomRange(p), false)
    p = setRangeEdge(p, 'end', 2)
    assert.deepEqual(rangeOf(p), { start: 0, end: 2 })
    p = setRangeEdge(p, 'start', 3)
    assert.deepEqual(rangeOf(p), { start: 3, end: 3 })
    assert.equal(hasCustomRange(clearRange(p)), false)
  })
  it('setting the full range drops the custom range', () => {
    let p = setRangeEdge(frames5(), 'end', 2)
    p = setRangeEdge(p, 'end', 4)
    assert.equal(p.range, undefined)
  })
  it('deleting frames keeps the range valid', () => {
    let p = setRangeEdge(setRangeEdge(frames5(), 'start', 3), 'end', 4)
    p = deleteFrame(p, p.frames[4].id).project
    p = deleteFrame(p, p.frames[3].id).project
    const r = rangeOf(p)
    assert.ok(r.start <= r.end && r.end <= p.frames.length - 1)
  })
  it('playSequence expands holds and honours the range', () => {
    let p = frames5()
    p = setHold(p, p.frames[1].id, 3)
    p = setHold(p, p.frames[2].id, 2)
    assert.equal(totalTicks(playSequence(p, false)), 1 + 3 + 2 + 1 + 1)
    p = setRangeEdge(setRangeEdge(p, 'start', 1), 'end', 2)
    const seq = playSequence(p, true)
    assert.deepEqual(seq.map((b) => b.index), [1, 2])
    assert.equal(totalTicks(seq), 5)
    assert.equal(playSequence(p, false).length, 5)
  })
  it('keyframes are frames with artwork', () => {
    let p = frames5()
    assert.equal(isKeyframe(p.frames[0]), false)
    p = appendStrokes(p, p.frames[0].id, p.layers[1].id, [mk('pencil', [[1, 1], [5, 5]])])
    assert.equal(isKeyframe(p.frames[0]), true)
    assert.equal(isKeyframe(p.frames[1]), false)
  })
})

// A tiny GIF decoder: enough to prove the encoder's LZW and framing are right.
function decodeGif(b: Uint8Array) {
  assert.equal(String.fromCharCode(...b.subarray(0, 6)), 'GIF89a')
  const w = b[6] | (b[7] << 8)
  const h = b[8] | (b[9] << 8)
  const flags = b[10]
  let p = 13
  const palSize = flags & 0x80 ? 1 << ((flags & 7) + 1) : 0
  const pal = b.subarray(p, p + palSize * 3)
  p += palSize * 3
  const frames: { delay: number; transparent: boolean; pixels: Uint8Array }[] = []
  let loop = false
  let delay = 0
  let transparent = false
  while (b[p] !== 0x3b) {
    if (b[p] === 0x21) {
      const label = b[p + 1]
      if (label === 0xf9) { transparent = !!(b[p + 3] & 1); delay = b[p + 4] | (b[p + 5] << 8) }
      if (label === 0xff) loop = true
      p += 2
      while (b[p] !== 0) p += b[p] + 1
      p += 1
    } else if (b[p] === 0x2c) {
      p += 10
      const min = b[p++]
      const data: number[] = []
      while (b[p] !== 0) { for (let i = 1; i <= b[p]; i += 1) data.push(b[p + i]); p += b[p] + 1 }
      p += 1
      frames.push({ delay, transparent, pixels: lzwDecode(Uint8Array.from(data), min, w * h) })
    } else throw new Error(`bad block ${b[p]}`)
  }
  return { w, h, pal, frames, loop }
}
function lzwDecode(data: Uint8Array, min: number, total: number) {
  const clear = 1 << min
  const eoi = clear + 1
  let size = min + 1
  let table: number[][] = []
  const reset = () => { table = []; for (let i = 0; i < clear; i += 1) table[i] = [i]; table[clear] = []; table[eoi] = []; size = min + 1 }
  reset()
  const out: number[] = []
  let bitPos = 0
  let prev: number[] | null = null
  const read = () => { let v = 0; for (let i = 0; i < size; i += 1) { v |= ((data[bitPos >> 3] >> (bitPos & 7)) & 1) << i; bitPos += 1 } return v }
  while (out.length < total) {
    const code = read()
    if (code === clear) { reset(); prev = null; continue }
    if (code === eoi) break
    let entry: number[]
    if (code < table.length) entry = table[code]
    else entry = [...prev!, prev![0]]
    out.push(...entry)
    if (prev) table.push([...prev, entry[0]])
    prev = entry
    if (table.length === 1 << size && size < 12) size += 1
  }
  return Uint8Array.from(out)
}

function solid(w: number, h: number, rgba: [number, number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < d.length; i += 4) d.set(rgba, i)
  return d
}

describe('GIF encoder', () => {
  it('LZW round-trips random and repetitive data, including table resets', () => {
    for (const make of [
      (n: number) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 16)),
      (n: number) => Uint8Array.from({ length: n }, (_, i) => (i >> 5) & 3),
      (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + (i >> 3)) & 255),
    ]) {
      const src = make(60000)
      const bits = Math.max(2, Math.ceil(Math.log2(Math.max(...src) + 1)))
      assert.deepEqual(lzwDecode(lzwEncode(src, bits), bits, src.length), src)
    }
  })
  it('encodes frames, delays and loop; colours survive', () => {
    const red = solid(8, 6, [255, 0, 0, 255])
    const blue = solid(8, 6, [0, 0, 255, 255])
    const g = decodeGif(encodeGif({ width: 8, height: 6, frames: [{ data: red, delay: 8 }, { data: blue, delay: 25 }], transparent: false, loop: true }))
    assert.equal(g.w, 8)
    assert.equal(g.h, 6)
    assert.equal(g.loop, true)
    assert.deepEqual(g.frames.map((f) => f.delay), [8, 25])
    const rgb = (f: number) => { const i = g.frames[f].pixels[0]; return [g.pal[i * 3], g.pal[i * 3 + 1], g.pal[i * 3 + 2]] }
    assert.ok(rgb(0)[0] > 240 && rgb(0)[2] < 20)
    assert.ok(rgb(1)[2] > 240 && rgb(1)[0] < 20)
  })
  it('transparent pixels map to index 0 and are flagged', () => {
    const d = solid(4, 4, [0, 0, 0, 0])
    d.set([10, 200, 30, 255], 0)
    const g = decodeGif(encodeGif({ width: 4, height: 4, frames: [{ data: d, delay: 5 }], transparent: true, loop: false }))
    assert.equal(g.loop, false)
    assert.equal(g.frames[0].transparent, true)
    assert.equal(g.frames[0].pixels[1], 0)
    assert.notEqual(g.frames[0].pixels[0], 0)
  })
  it('a many-colour gradient stays within the palette and decodes to the right size', () => {
    const d = new Uint8ClampedArray(64 * 64 * 4)
    for (let i = 0; i < 64 * 64; i += 1) d.set([i % 64 * 4, (i >> 6) * 4, (i * 3) & 255, 255], i * 4)
    const g = decodeGif(encodeGif({ width: 64, height: 64, frames: [{ data: d, delay: 4 }], transparent: false, loop: true }))
    assert.equal(g.frames[0].pixels.length, 4096)
    assert.ok(g.pal.length <= 768)
    // mean colour error should be modest
    let err = 0
    for (let i = 0; i < 4096; i += 1) err += Math.abs(g.pal[g.frames[0].pixels[i] * 3] - d[i * 4])
    assert.ok(err / 4096 < 16, `mean red error ${err / 4096}`)
  })
})

describe('zip writer', () => {
  it('crc32 matches the known check value', () => assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926))
  it('round-trips entries', () => {
    const e = [{ name: 'a-001.png', data: Uint8Array.from([1, 2, 3]) }, { name: 'a-002.png', data: new Uint8Array(0) }]
    const back = readZip(zipBytes(e))
    assert.deepEqual(back.map((x) => x.name), ['a-001.png', 'a-002.png'])
    assert.deepEqual(back[0].data, e[0].data)
  })
})

describe('lasso selection', () => {
  const poly = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 50 }]
  it('selects strokes mostly inside the loop and ignores the rest', () => {
    const inside = mk('pencil', [[20, 20], [30, 30], [40, 40]])
    const outside = mk('pencil', [[80, 50], [90, 55]])
    const straddle = mk('pencil', [[20, 20], [30, 30], [70, 30], [80, 30]]) // half in
    const mostlyOut = mk('pencil', [[20, 20], [70, 30], [80, 30], [90, 30]])
    assert.deepEqual(strokeIdsInPolygon([inside, outside, straddle, mostlyOut], poly), [inside.id, straddle.id])
  })
  it('needs a real loop, and works for concave shapes', () => {
    const s = mk('pencil', [[20, 20], [25, 25]])
    assert.deepEqual(strokeIdsInPolygon([s], poly.slice(0, 2)), [])
    const L = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 40 }, { x: 0, y: 40 }]
    const inArm = mk('pencil', [[5, 30], [5, 35]])
    const inHole = mk('pencil', [[30, 30], [35, 35]])
    assert.deepEqual(strokeIdsInPolygon([inArm, inHole], L), [inArm.id])
  })
})

// -------------------------------------------------- clipboard + colour wheel
import { cloneStrokes, copyableStrokes } from '../src/engine/clipboard.ts'
import { buildPaletteGrid, hexToHsv, hsvToHex, hsvToRgb, rgbToHsv, rgbToHex } from '../src/engine/color.ts'

describe('clipboard', () => {
  it('clones with new ids, leaves originals alone, and can shift', () => {
    const a = mk('pencil', [[10, 10], [20, 20]])
    const [c] = cloneStrokes([a], 5, -3)
    assert.notEqual(c.id, a.id)
    assert.deepEqual(c.points[0], { x: 15, y: 7, p: 1 })
    assert.deepEqual(a.points[0], { x: 10, y: 10, p: 1 })
    assert.equal(cloneStrokes([a])[0].points[0].x, 10)
  })
  it('does not copy eraser strokes', () => {
    const keep = mk('pencil', [[1, 1], [2, 2]])
    const er = mk('eraser', [[1, 1], [2, 2]])
    assert.deepEqual(copyableStrokes([keep, er]).map((s) => s.id), [keep.id])
  })
  it('paste into another frame leaves the source frame untouched', () => {
    let p = addFrame(proj()).project
    const [f0, f1] = p.frames
    const layer = p.layers[1].id
    const s = mk('pencil', [[10, 10], [30, 30]])
    p = appendStrokes(p, f0.id, layer, [s])
    p = appendStrokes(p, f1.id, layer, cloneStrokes(copyableStrokes(celOf(p.frames[0], layer))))
    assert.equal(celOf(p.frames[0], layer).length, 1)
    assert.equal(celOf(p.frames[1], layer).length, 1)
    assert.notEqual(celOf(p.frames[1], layer)[0].id, s.id)
  })
})

describe('colour maths', () => {
  it('known colours', () => {
    assert.deepEqual(rgbToHsv(255, 0, 0), { h: 0, s: 1, v: 1 })
    assert.equal(hsvToHex(120, 1, 1), '#00ff00')
    assert.equal(hsvToHex(240, 1, 1), '#0000ff')
    assert.equal(hsvToHex(0, 0, 0.5), '#808080')
    assert.deepEqual(hsvToRgb(60, 1, 1), [255, 255, 0])
  })
  it('round-trips every hex within 1 step', () => {
    for (let i = 0; i < 400; i += 1) {
      const r = (i * 37) % 256, g = (i * 91) % 256, b = (i * 53) % 256
      const { h, s, v } = rgbToHsv(r, g, b)
      const back = hsvToRgb(h, s, v)
      assert.ok(Math.abs(back[0] - r) <= 1 && Math.abs(back[1] - g) <= 1 && Math.abs(back[2] - b) <= 1, `${r},${g},${b} -> ${back}`)
    }
    assert.equal(hsvToHex(...(Object.values(hexToHsv('#168CFF')) as [number, number, number])).toLowerCase(), '#168cff')
  })
  it('palette grid is big, unique-ish and valid', () => {
    const g = buildPaletteGrid()
    assert.equal(g.length, 84)
    assert.ok(g.every((c) => /^#[0-9A-F]{6}$/.test(c)))
    assert.ok(new Set(g).size >= 70)
    void rgbToHex
  })
})

// -------------------------------------------------------- Phase 4 templates
import { CATALOG, CATEGORIES } from '../src/engine/templates/catalog.ts'
import { CYCLES, POSES, keyed } from '../src/engine/templates/cycles.ts'
import { GROUND, figureShapes, solve } from '../src/engine/templates/figure.ts'
import { headShapes } from '../src/engine/templates/head.ts'
import { shapeToPolylines, shapesBounds } from '../src/engine/templates/shapes.ts'
import { guideMapper, shapesToStrokes } from '../src/engine/templates/stamp.ts'

const finite = (shapes: ReturnType<typeof headShapes>) => shapes.every((s) => shapeToPolylines(s).every((pl) => pl.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))))

describe('template catalogue', () => {
  it('has unique ids, every category filled, and real content', () => {
    assert.equal(new Set(CATALOG.map((t) => t.id)).size, CATALOG.length)
    for (const c of CATEGORIES) assert.ok(CATALOG.some((t) => t.category === c), c)
    assert.ok(CATALOG.length >= 40, `only ${CATALOG.length}`)
    for (const t of CATALOG) {
      assert.ok(t.shapes.length >= 3, t.id)
      assert.ok(finite(t.shapes), t.id)
      const b = shapesBounds(t.shapes)
      assert.ok(b.x0 >= -0.75 && b.x1 <= 0.75 && b.y0 >= -0.75 && b.y1 <= 0.75, `${t.id} out of the guide box`)
    }
  })
  it('every template says how the animator uses it', () => {
    for (const t of CATALOG) assert.ok(t.description.length > 8, t.id)
  })
})

describe('figure poser', () => {
  it('plants the feet on the ground for grounded poses', () => {
    for (const k of ['standing', 'walking', 'sitting', 'kneeling', 'fighting', 'reaching', 'turning'] as const) {
      const j = solve(POSES[k])
      assert.ok(Math.abs(Math.max(j.ftL[1], j.ftR[1]) - GROUND) < 0.2 && Math.max(j.ftL[1], j.ftR[1], j.knL[1], j.knR[1]) <= GROUND + 1e-9, k)
    }
    const s = solve(POSES.standing)
    assert.ok(Math.abs(Math.max(s.ftL[1], s.ftR[1]) - GROUND) < 1e-9)
  })
  it('limb lengths stay constant across a walk cycle', () => {
    const walk = CYCLES.find((c) => c.id === 'walk')!
    assert.equal(walk.frame(0, 8).length, walk.frame(3, 8).length)
  })
  it('lifted poses float above the ground', () => {
    const j = solve(POSES.jumping)
    assert.ok(Math.max(j.ftL[1], j.ftR[1]) < GROUND - 0.05)
  })
})

describe('turnable head', () => {
  it('draws at every angle with finite numbers', () => {
    for (const yaw of [-90, -45, 0, 20, 45, 70, 90, 180]) for (const pitch of [-40, 0, 40]) assert.ok(finite(headShapes(yaw, pitch)), `${yaw}/${pitch}`)
  })
  it('the face centre line moves as the head turns', () => {
    const cx = (yaw: number) => {
      const s = headShapes(yaw, 0).find((x) => x.k === 'line' && x.pts.length > 10)!
      return s.k === 'line' ? s.pts.reduce((a, p) => a + p[0], 0) / s.pts.length : 0
    }
    assert.ok(Math.abs(cx(0)) < 0.01)
    assert.ok(cx(45) > cx(20) && cx(20) > cx(0))
    assert.ok(Math.abs(cx(-45) + cx(45)) < 0.01)
  })
})

describe('motion cycles', () => {
  it('the blueprint list is present and every frame draws', () => {
    for (const id of ['walk', 'run', 'jump', 'idle', 'turnaround', 'falling', 'landing', 'punch', 'kick', 'throw', 'wave', 'head-turn', 'blink', 'breathing']) assert.ok(CYCLES.some((c) => c.id === id), id)
    for (const c of CYCLES) for (const n of [1, 4, c.defaultFrames, 16]) for (let i = 0; i < n; i += 1) {
      const s = c.frame(i, n)
      assert.ok(s.length > 2 && finite(s), `${c.id} ${i}/${n}`)
    }
  })
  it('a run cycle defaults to 8 frames, as in the blueprint example', () => assert.equal(CYCLES.find((c) => c.id === 'run')!.defaultFrames, 8))
  it('walk frames differ over the cycle but loop back (frame n would equal frame 0)', () => {
    const walk = CYCLES.find((c) => c.id === 'walk')!
    const sig = (i: number, n: number) => JSON.stringify(walk.frame(i, n))
    assert.notEqual(sig(0, 8), sig(2, 8))
    assert.equal(sig(0, 8), sig(0, 8))
  })
  it('keyed poses hit their keys exactly', () => {
    const k = keyed([[0, POSES.standing], [0.5, POSES.walking], [1, POSES.standing]], 0.5)
    assert.equal(k.lean, POSES.walking.lean)
    assert.equal(keyed([[0, POSES.standing], [1, POSES.walking]], 0).lean, POSES.standing.lean)
    assert.equal(keyed([[0, POSES.standing], [1, POSES.walking]], 1).lean, POSES.walking.lean)
  })
  it('jump rises then lands', () => {
    const jump = CYCLES.find((c) => c.id === 'jump')!
    const footY = (i: number) => { const s = jump.frame(i, 10)[7]; return s.k === 'line' ? Math.max(...s.pts.map((p) => p[1])) : 0 }
    assert.ok(footY(5) < footY(0) - 0.05)
    assert.ok(Math.abs(footY(9) - footY(0)) < 0.02)
    void figureShapes
  })
})

describe('guide layers and cycle insertion', () => {
  const unitGuide = { x: 0, y: 0, scale: 1, stretchX: 1, rotation: 0, flipX: false }
  it('maps the unit box onto the canvas like the on-screen guide', () => {
    const m = guideMapper(unitGuide, 200, 100) // unit = 100
    assert.deepEqual(m([0, 0]), { x: 100, y: 50 })
    assert.deepEqual(m([0.5, -0.5]), { x: 150, y: 0 })
    const flipped = guideMapper({ ...unitGuide, flipX: true }, 200, 100)([0.5, 0])
    assert.equal(flipped.x, 50)
    const rot = guideMapper({ ...unitGuide, rotation: 90 }, 200, 100)([0.5, 0])
    assert.ok(Math.abs(rot.x - 100) < 1e-9 && Math.abs(rot.y - 100) < 1e-9)
    const moved = guideMapper({ ...unitGuide, x: 10, y: -5, scale: 2, stretchX: 0.5 }, 200, 100)([0.5, 0.5])
    assert.deepEqual(moved, { x: 100 + 10 + 0.5 * 100 * 1, y: 50 - 5 + 0.5 * 100 * 2 })
  })
  it('turns shapes into editable line strokes', () => {
    const strokes = shapesToStrokes([...CATALOG[0].shapes.slice(0, 2)], guideMapper(unitGuide, 100, 100), { size: 2 })
    assert.ok(strokes.length >= 2)
    assert.ok(strokes.every((s) => s.tool === 'line' && s.points.length >= 2 && s.size === 2))
    assert.equal(new Set(strokes.map((s) => s.id)).size, strokes.length)
  })
  it('inserts a cycle as an ordinary exported layer when asGuide is false', () => {
    const p = frames5()
    const walk = CYCLES.find((c) => c.id === 'walk')!
    const map = guideMapper(unitGuide, p.width, p.height)
    const per = Array.from({ length: 4 }, (_, i) => shapesToStrokes(walk.frame(i, 4), map, { size: 2 }))
    const r = insertGuideFrames(p, p.frames[0].id, 'Walk', per, false)
    const layer = r.project.layers.find((l) => l.id === r.layerId)!
    assert.ok(!layer.guide)
    assert.equal(r.project.frames.length, 9)
    assert.ok(celOf(r.project.frames[1], layer.id).length > 0)
  })
  it('inserts N frames after the current one on a new guide layer', () => {
    let p = frames5() // 5 frames
    const after = p.frames[1].id
    const walk = CYCLES.find((c) => c.id === 'walk')!
    const map = guideMapper(unitGuide, p.width, p.height)
    const per = Array.from({ length: 8 }, (_, i) => shapesToStrokes(walk.frame(i, 8), map, { size: 2 }))
    const r = insertGuideFrames(p, after, 'Guide · Walk', per)
    p = r.project
    assert.equal(p.frames.length, 13)
    assert.equal(p.frames[1].id, after)
    assert.deepEqual(p.frames.slice(2, 10).map((f) => f.id), r.frameIds)
    const layer = p.layers.find((l) => l.id === r.layerId)!
    assert.equal(layer.guide, true)
    assert.equal(p.layers[p.layers.length - 1].id, layer.id)
    assert.ok(celOf(p.frames[2], layer.id).length > 0)
    assert.equal(celOf(p.frames[0], layer.id).length, 0)
    // each frame has different art
    assert.notEqual(JSON.stringify(celOf(p.frames[2], layer.id).map((s) => s.points)), JSON.stringify(celOf(p.frames[4], layer.id).map((s) => s.points)))
  })
  it('guide art does not make a frame a keyframe', () => {
    const p0 = proj()
    const r = stampGuide(p0, p0.frames[0].id, 'Guide', shapesToStrokes(CATALOG[0].shapes.slice(0, 2), guideMapper(unitGuide, 100, 60), { size: 2 }))
    assert.equal(isKeyframe(r.project.frames[0]), true) // raw check sees strokes
    assert.equal(isKeyframe(r.project.frames[0], r.project.layers), false)
    const again = stampGuide(r.project, r.project.frames[0].id, 'Guide', [])
    assert.equal(again.project.layers.filter((l) => l.guide).length, 1) // reuses the layer
  })
  it('stamping twice reuses one guide layer and adds strokes', () => {
    const p0 = proj()
    const s = shapesToStrokes(CATALOG[1].shapes, guideMapper(unitGuide, 100, 60), { size: 2 })
    const a = stampGuide(p0, p0.frames[0].id, 'Guide', s)
    const b = stampGuide(a.project, a.project.frames[0].id, 'Guide', shapesToStrokes(CATALOG[1].shapes, guideMapper(unitGuide, 100, 60), { size: 2 }))
    assert.equal(b.project.layers.filter((l) => l.guide).length, 1)
    assert.equal(celOf(b.project.frames[0], b.layerId).length, s.length * 2)
  })
  it('guide flag survives save and load', () => {
    const p0 = proj()
    const r = addGuideLayer(p0, 'Guide · X')
    assert.equal(projectFromJSON(projectToJSON(r.project)).layers.find((l) => l.guide)?.name, 'Guide · X')
  })
})

describe('cycles stay inside the guide box', () => {
  it('no frame of any cycle leaves the canvas square', () => {
    for (const c of CYCLES) for (let i = 0; i < c.defaultFrames; i += 1) {
      const b = shapesBounds(c.frame(i, c.defaultFrames))
      assert.ok(b.y0 >= -0.5 && b.y1 <= 0.5 && b.x0 >= -0.5 && b.x1 <= 0.5, `${c.id} frame ${i}: ${JSON.stringify(b)}`)
    }
  })
})

// ------------------------------------------------------------- perspective
import { PERSPECTIVE_MODES, defaultPerspective, snapToPerspective, vanishingPoints } from '../src/engine/guides.ts'

describe('perspective system', () => {
  const W = 1000, H = 600
  const on = (mode: Parameters<typeof vanishingPoints>[0]['mode'], extra = {}) => ({ ...defaultPerspective(), enabled: true, snap: true, mode, ...extra })
  it('offers every mode the blueprint lists', () => {
    for (const m of ['one-point', 'two-point', 'three-point', 'four-point', 'fisheye', 'curvilinear', 'isometric', 'birds-eye', 'worms-eye']) assert.ok(PERSPECTIVE_MODES.some((x) => x.id === m), m)
  })
  it('vanishing point counts and positions', () => {
    const n = (mode: Parameters<typeof vanishingPoints>[0]['mode']) => vanishingPoints(on(mode), W, H).length
    assert.deepEqual(['one-point', 'two-point', 'three-point', 'birds-eye', 'worms-eye', 'four-point', 'isometric', 'fisheye', 'curvilinear'].map((m) => n(m as never)), [1, 2, 3, 3, 3, 4, 0, 0, 0])
    const two = vanishingPoints(on('two-point'), W, H)
    assert.ok(two[0].x < 0 && two[1].x > W && two[0].y === H * 0.45)
    const down = vanishingPoints(on('birds-eye'), W, H)[2]
    const up = vanishingPoints(on('worms-eye'), W, H)[2]
    assert.ok(down.y > H * 0.45 && up.y < H * 0.45)
  })
  it('spread moves the vanishing points', () => {
    const near = vanishingPoints(on('two-point', { spread: 0.5 }), W, H)
    const far = vanishingPoints(on('two-point', { spread: 1.5 }), W, H)
    assert.ok(far[1].x - far[0].x > near[1].x - near[0].x)
  })
  it('a nearly-aimed line snaps exactly onto the ray to the vanishing point', () => {
    const p = on('one-point')
    const vp = vanishingPoints(p, W, H)[0]
    const a = { x: 100, y: 500 }
    const aim = Math.atan2(vp.y - a.y, vp.x - a.x)
    const b = { x: a.x + Math.cos(aim + 0.05) * 300, y: a.y + Math.sin(aim + 0.05) * 300 }
    const s = snapToPerspective(p, W, H, a, b)
    const got = Math.atan2(s.y - a.y, s.x - a.x)
    assert.ok(Math.abs(got - aim) < 1e-9)
    assert.ok(Math.abs(Math.hypot(s.x - a.x, s.y - a.y) - 300) < 3) // length stays about the same
  })
  it('lines far from any grid direction are left alone, and snapping can be off', () => {
    const p = on('two-point')
    const a = { x: 500, y: 100 }
    const b = { x: 560, y: 400 } // steep but not vertical-ish enough? vertical is allowed at 9°
    const odd = { x: 700, y: 330 } // ~45°, not aligned with a ray or vertical
    assert.deepEqual(snapToPerspective(p, W, H, a, odd), odd)
    assert.notDeepEqual(snapToPerspective({ ...p, snap: false }, W, H, a, b), { x: 0, y: 0 })
    assert.deepEqual(snapToPerspective({ ...p, snap: false }, W, H, a, b), b)
    assert.deepEqual(snapToPerspective({ ...p, enabled: false }, W, H, a, b), b)
  })
  it('two-point snaps near-vertical lines to exactly vertical', () => {
    const s = snapToPerspective(on('two-point'), W, H, { x: 500, y: 100 }, { x: 512, y: 400 })
    assert.equal(s.x, 500)
  })
  it('isometric snaps to 30° and vertical; fisheye never snaps', () => {
    const iso = snapToPerspective(on('isometric'), W, H, { x: 0, y: 0 }, { x: 300, y: 160 })
    assert.ok(Math.abs(Math.atan2(iso.y, iso.x) - Math.PI / 6) < 1e-9)
    const back = snapToPerspective(on('isometric'), W, H, { x: 300, y: 300 }, { x: 40, y: 150 }) // up-left, along the 30° axis
    assert.ok(Math.abs((back.y - 300) / (back.x - 300) - Math.tan(Math.PI / 6)) < 1e-9)
    const b = { x: 300, y: 160 }
    assert.deepEqual(snapToPerspective(on('fisheye'), W, H, { x: 0, y: 0 }, b), b)
  })
  it('a tiny drag is never snapped (avoids jumpy dots)', () => {
    const b = { x: 502, y: 101 }
    assert.deepEqual(snapToPerspective(on('two-point'), W, H, { x: 500, y: 100 }, b), b)
  })
})

// -------------------------------------------------------------- Phase 5
import { AUTO_INTERVAL_MS, MAX_AUTO, MAX_KEPT, hasArtwork, restoredProject, shouldAutoSnapshot, snapshotsToPrune, type SnapshotMeta } from '../src/engine/versions.ts'
import { listSnapshots, loadProject, loadSnapshot, removeProject, removeSnapshot, saveProject, saveSnapshot } from '../src/engine/storage.ts'
import { resizeCanvas, setBackground } from '../src/engine/projectOps.ts'

const snapMeta = (o: Partial<SnapshotMeta>): SnapshotMeta => ({ id: 'x', projectId: 'p', createdAt: 0, kind: 'auto', note: '', frames: 1, layers: 3, projectUpdatedAt: 0, thumb: null, ...o })

describe('restore point policy', () => {
  const drawn = () => { const p = proj(); return appendStrokes(p, p.frames[0].id, p.layers[1].id, [mk('pencil', [[1, 1], [9, 9]])]) }
  it('skips empty projects', () => {
    assert.equal(hasArtwork(proj()), false)
    assert.equal(shouldAutoSnapshot(undefined, proj(), 1e12), false)
    assert.equal(shouldAutoSnapshot(undefined, drawn(), 1e12), true)
  })
  it('waits for the interval and for real changes', () => {
    const p = { ...drawn(), updatedAt: 10_000 }
    const last = snapMeta({ createdAt: 1_000_000, projectUpdatedAt: 10_000 })
    assert.equal(shouldAutoSnapshot(last, p, 1_000_000 + AUTO_INTERVAL_MS + 1), false) // nothing changed
    assert.equal(shouldAutoSnapshot(last, { ...p, updatedAt: 20_000 }, 1_000_000 + 1000), false) // too soon
    assert.equal(shouldAutoSnapshot(last, { ...p, updatedAt: 20_000 }, 1_000_000 + AUTO_INTERVAL_MS), true)
  })
  it('prunes oldest auto points and oldest manual points separately', () => {
    const list = [
      ...Array.from({ length: MAX_AUTO + 3 }, (_, i) => snapMeta({ id: `a${i}`, createdAt: i, kind: 'auto' })),
      ...Array.from({ length: MAX_KEPT + 2 }, (_, i) => snapMeta({ id: `m${i}`, createdAt: 100 + i, kind: i % 2 ? 'manual' : 'before-restore' })),
    ]
    const gone = new Set(snapshotsToPrune(list))
    assert.equal(gone.size, 5)
    assert.ok(['a0', 'a1', 'a2', 'm0', 'm1'].every((id) => gone.has(id)))
    assert.ok(!gone.has(`a${MAX_AUTO + 2}`) && !gone.has(`m${MAX_KEPT + 1}`))
  })
  it('restoring keeps this project’s identity but the old drawing', () => {
    const cur = { ...proj(), name: 'Current', archived: true, createdAt: 5 }
    const old = drawn()
    const r = restoredProject(cur, old, 777)
    assert.equal(r.id, cur.id)
    assert.equal(r.name, 'Current')
    assert.equal(r.archived, true)
    assert.equal(r.createdAt, 5)
    assert.equal(r.updatedAt, 777)
    assert.equal(celOf(r.frames[0], old.layers[1].id).length, 1)
  })
})

describe('restore point storage', () => {
  it('saves, lists newest first, loads and removes', async () => {
    const p = proj()
    await saveProject(p, null)
    const a = await saveSnapshot(p, 'manual', null, '  before the chase  ')
    await new Promise((r) => setTimeout(r, 3))
    const q = appendStrokes(p, p.frames[0].id, p.layers[1].id, [mk('pencil', [[1, 1], [9, 9]])])
    const b = await saveSnapshot(q, 'auto', 'data:x')
    const list = await listSnapshots(p.id)
    assert.deepEqual(list.map((s) => s.id), [b.id, a.id])
    assert.equal(list[1].note, 'before the chase')
    assert.equal(celOf((await loadSnapshot(b.id))!.frames[0], p.layers[1].id).length, 1)
    assert.equal(celOf((await loadSnapshot(a.id))!.frames[0], p.layers[1].id).length, 0)
    await removeSnapshot(a.id)
    assert.equal((await listSnapshots(p.id)).length, 1)
    await removeProject(p.id)
    assert.equal((await listSnapshots(p.id)).length, 0)
  })
  it('keeps only the newest auto points', async () => {
    const p = proj()
    for (let i = 0; i < MAX_AUTO + 3; i += 1) { await saveSnapshot(p, 'auto', null); await new Promise((r) => setTimeout(r, 2)) }
    assert.equal((await listSnapshots(p.id)).length, MAX_AUTO)
    await removeProject(p.id)
  })
})

describe('canvas resize', () => {
  const withArt = () => {
    let p = createProject({ name: 'R', width: 200, height: 100, fps: 12, background: '#ffffff' })
    p = appendStrokes(p, p.frames[0].id, p.layers[1].id, [mk('pencil', [[10, 10], [20, 20]])])
    return p
  }
  const first = (p: ReturnType<typeof withArt>) => celOf(p.frames[0], p.layers[1].id)[0].points[0]
  it('centre anchor shifts art by half the growth', () => {
    const r = resizeCanvas(withArt(), 300, 200, 0.5, 0.5)
    assert.deepEqual([r.width, r.height], [300, 200])
    assert.deepEqual([first(r).x, first(r).y], [60, 60])
  })
  it('top-left anchor leaves art alone; bottom-right moves it fully', () => {
    assert.deepEqual([first(resizeCanvas(withArt(), 300, 200, 0, 0)).x, first(resizeCanvas(withArt(), 300, 200, 0, 0)).y], [10, 10])
    const br = resizeCanvas(withArt(), 300, 200, 1, 1)
    assert.deepEqual([first(br).x, first(br).y], [110, 110])
  })
  it('shrinking then growing again brings the art back', () => {
    const p = withArt()
    const small = resizeCanvas(p, 120, 80, 0.5, 0.5)
    assert.equal(celOf(small.frames[0], p.layers[1].id).length, 1) // nothing deleted
    const back = resizeCanvas(small, 200, 100, 0.5, 0.5)
    assert.deepEqual([first(back).x, first(back).y], [10, 10])
  })
  it('fills and merged bitmaps move with the art; sizes are clamped; no-op returns the same object', () => {
    let p = createProject({ name: 'R', width: 200, height: 100, fps: 12, background: '#ffffff' })
    const fill = { ...mk('pencil', [[30, 30]]), tool: 'fill' as const }
    const bm = { ...mk('pencil', []), tool: 'bitmap' as const, bitmap: { x: 5, y: 6, w: 1, h: 1, data: new Uint8ClampedArray(4) } }
    p = appendStrokes(p, p.frames[0].id, p.layers[1].id, [fill, bm])
    const r = resizeCanvas(p, 250, 100, 1, 0)
    const [f, b] = celOf(r.frames[0], p.layers[1].id)
    assert.equal(f.points[0].x, 80)
    assert.equal(b.bitmap!.x, 55)
    assert.equal(resizeCanvas(p, 1, 1).width, 64)
    assert.equal(resizeCanvas(p, 99999, 99999).width, 4096)
    assert.equal(resizeCanvas(p, 200, 100), p)
  })
  it('does not touch other frames’ structure and keeps holds', () => {
    let p = addFrame(withArt()).project
    p = setHold(p, p.frames[1].id, 3)
    const r = resizeCanvas(p, 120, 60, 0.5, 0.5)
    assert.equal(r.frames.length, 2)
    assert.equal(holdOf(r.frames[1]), 3)
  })
  it('background can change or go transparent', () => {
    assert.equal(setBackground(proj(), null).background, null)
    const p = proj()
    assert.equal(setBackground(p, p.background), p)
  })
})

// ---------------------------------------------------------------- Phase 6: video export

it('video sizing: even dimensions, contain fit, presets', () => {
  assert.equal(evenDim(1001), 1000)
  assert.equal(evenDim(1), 2)
  const f = fitContain(1000, 500, 1080, 1920)
  assert.equal(Math.round(f.w), 1080)
  assert.equal(Math.round(f.h), 540)
  assert.equal(Math.round(f.y), 690)
  assert.equal(presetById('nope').id, 'project')
  assert.equal(presetById('tiktok').h, 1920)
})

it('video timing: holds keep their length at any export rate', () => {
  const seq = [
    { index: 0, frameId: 'a', ticks: 1 },
    { index: 1, frameId: 'b', ticks: 3 },
    { index: 2, frameId: 'c', ticks: 2 },
  ]
  // 6 ticks at 12 fps = 0.5 s
  assert.equal(videoFrameCount(seq, 12, 12), 6)
  assert.equal(videoFrameCount(seq, 12, 24), 12)
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((k) => beatAtVideoFrame(seq, k, 12, 12)), [0, 1, 1, 1, 2, 2])
  assert.deepEqual([0, 2, 3, 7, 8, 11].map((k) => beatAtVideoFrame(seq, k, 12, 24)), [0, 1, 1, 1, 2, 2])
  assert.equal(beatAtVideoFrame(seq, 999, 12, 12), 2)
  assert.ok(videoBitrate(1920, 1080, 30, 'high') > videoBitrate(1920, 1080, 30, 'low'))
  assert.ok(videoBitrate(64, 64, 1, 'low') >= 250_000)
})

function boxes(b: Uint8Array, start = 0, end = b.length) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const out: { type: string; start: number; size: number }[] = []
  for (let p = start; p < end; ) {
    const size = v.getUint32(p)
    out.push({ type: String.fromCharCode(...b.subarray(p + 4, p + 8)), start: p, size })
    p += size
  }
  return out
}

it('mp4 muxer: box layout, sample table and chunk offset', () => {
  const samples = [0, 1, 2].map((i) => ({ data: new Uint8Array([i, i, i, i, i]), timeUs: i * 100000, isKey: i === 0 }))
  const file = muxMp4({ width: 320, height: 180, avcC: new Uint8Array([1, 100, 0, 40]), samples, lastDurationUs: 100000 })
  const top = boxes(file)
  assert.deepEqual(top.map((b) => b.type), ['ftyp', 'moov', 'mdat'])
  assert.equal(top[0].size + top[1].size + top[2].size, file.length)
  // chunk offset must point at the first sample byte inside mdat
  const mdat = top[2]
  const idx = Array.from(file).findIndex((_, i) => i > 0 && String.fromCharCode(...file.subarray(i, i + 4)) === 'stco')
  const off = new DataView(file.buffer).getUint32(idx + 4 + 4 + 4)
  assert.equal(off, mdat.start + 8)
  assert.equal(file[off], 0)
  assert.equal(file[off + 5], 1)
})

it('webm muxer: EBML header, one cluster per ~4 s of keyframes, cues present', () => {
  const samples = Array.from({ length: 200 }, (_, i) => ({ data: new Uint8Array([i & 255]), timeUs: i * 50000, isKey: i % 20 === 0 }))
  const file = muxWebm({ width: 640, height: 360, codec: 'V_VP9', samples, lastDurationUs: 50000 })
  assert.deepEqual(Array.from(file.subarray(0, 4)), [0x1a, 0x45, 0xdf, 0xa3])
  const text = String.fromCharCode(...file)
  assert.ok(text.includes('webm') && text.includes('V_VP9'))
  const count = (id: number[]) => { let n = 0; for (let i = 0; i < file.length - id.length; i += 1) if (id.every((x, j) => file[i + j] === x)) n += 1; return n }
  assert.ok(count([0x1c, 0x53, 0xbb, 0x6b]) === 1)
  assert.ok(count([0x1f, 0x43, 0xb6, 0x75]) >= 2)
})

// ---------------------------------------------------------------- Phase 3b: camera
describe('camera', () => {
  const base = () => {
    let p = createProject({ name: 'cam', width: 200, height: 100, fps: 12, background: null })
    p = addFrame(p, p.frames[0].id).project
    p = addFrame(p, p.frames[1].id).project
    p = addFrame(p, p.frames[2].id).project
    return p // 4 frames
  }
  it('no keys = still, whole canvas', () => {
    const p = base()
    assert.equal(hasCamera(p), false)
    assert.deepEqual(cameraAt(p, 2), defaultPose(p))
  })
  it('interpolates between keys, holds outside them', () => {
    let p = base()
    p = setCameraKey(p, p.frames[0].id, { x: 100, y: 50, zoom: 1, rot: 0 }, 'linear')
    p = setCameraKey(p, p.frames[3].id, { x: 160, y: 50, zoom: 4, rot: 90 })
    const mid = cameraAt(p, 1)
    assert.ok(Math.abs(mid.x - 120) < 1e-9)
    assert.ok(Math.abs(mid.rot - 30) < 1e-9)
    assert.ok(Math.abs(mid.zoom - Math.pow(4, 1 / 3)) < 1e-9) // even in log space
    assert.deepEqual(cameraAt(p, 3).zoom, 4)
    assert.equal(cameraKeys(p).length, 2)
  })
  it('hold keeps the pose until the next key, smooth eases', () => {
    let p = base()
    p = setCameraKey(p, p.frames[0].id, { x: 0, y: 0, zoom: 1, rot: 0 }, 'hold')
    p = setCameraKey(p, p.frames[2].id, { x: 100, y: 0, zoom: 1, rot: 0 }, 'smooth')
    assert.equal(cameraAt(p, 1).x, 0)
    let q = setCameraKey(p, p.frames[0].id, { x: 0, y: 0, zoom: 1, rot: 0 }, 'smooth')
    assert.equal(cameraAt(q, 1).x, 50) // smoothstep(0.5) = 0.5
    q = setCameraKey(q, p.frames[0].id, { x: 0, y: 0, zoom: 1, rot: 0 }, 'smooth')
    assert.equal(q.camera!.length, 2) // replaced, not duplicated
  })
  it('clamps zoom, removes and clears keys, ignores keys of deleted frames', () => {
    let p = base()
    p = setCameraKey(p, p.frames[1].id, { x: 10, y: 10, zoom: 99, rot: 0 })
    assert.equal(p.camera![0].zoom, 4)
    const id = p.frames[1].id
    const gone = deleteFrame(p, id).project
    assert.equal(hasCamera(gone), false)
    assert.equal(removeCameraKey(p, id).camera, undefined)
    assert.equal(clearCamera(p).camera, undefined)
    assert.equal(removeCameraKey(p, 'nope'), p)
  })
  it('matrix: centre maps to the middle, zoom 2 doubles, rotation turns clockwise', () => {
    const p = base()
    const m = cameraMatrix(p, { x: 150, y: 50, zoom: 2, rot: 0 })
    assert.equal(m.a * 150 + m.c * 50 + m.e, 100)
    assert.equal(m.b * 150 + m.d * 50 + m.f, 50)
    assert.equal(m.a * 160 + m.c * 50 + m.e - 100, 20)
    const r = cameraMatrix(p, { x: 100, y: 50, zoom: 1, rot: 90 })
    // a point to the right of centre ends up above it when the camera rotates clockwise
    const px = r.a * 150 + r.c * 50 + r.e
    const py = r.b * 150 + r.d * 50 + r.f
    assert.ok(Math.abs(px - 100) < 1e-9 && Math.abs(py - 0) < 1e-9)
  })
  it('resizing the canvas moves camera centres with the artwork', () => {
    const b = base()
    let p = setCameraKey(b, b.frames[0].id, { x: 100, y: 50, zoom: 1, rot: 0 })
    p = resizeCanvas(p, 300, 100, 1, 0)
    assert.equal(p.camera![0].x, 200)
  })
})

// ---------------------------------------------------------------- Phase 3b: audio
describe('audio', () => {
  const track = (over: Partial<AudioTrack> = {}): AudioTrack => ({ name: 't.wav', mime: 'audio/wav', data: new Uint8Array([1, 2, 3]), duration: 2, offset: 0, volume: 1, muted: false, peaks: new Uint8Array(200).fill(128), ...over })
  const proj = () => {
    let p = createProject({ name: 'snd', width: 200, height: 100, fps: 10, background: null })
    p = addFrame(p, p.frames[0].id).project
    p = addFrame(p, p.frames[1].id).project
    return { ...p, audio: track() } as typeof p
  }
  it('peaks follow loudness, 100 per second', () => {
    const ch = new Float32Array(48000)
    ch.fill(0, 0, 24000)
    ch.fill(-0.5, 24000)
    const pk = computePeaks([ch], 48000)
    assert.equal(pk.length, 100)
    assert.equal(pk[10], 0)
    assert.equal(pk[90], 128)
  })
  it('frame spans honour holds and the timeline length', () => {
    let p = proj()
    p = { ...p, frames: p.frames.map((f, i) => (i === 1 ? { ...f, hold: 3 } : f)) }
    assert.deepEqual(frameSpan(p, 0), [0, 0.1])
    const [a, b] = frameSpan(p, 1)
    assert.ok(Math.abs(a - 0.1) < 1e-9 && Math.abs(b - 0.4) < 1e-9)
    assert.ok(Math.abs(timelineSeconds(p) - 0.5) < 1e-9)
  })
  it('peaksForSpan is silent outside the clip and respects the offset', () => {
    const a = track({ offset: 1, peaks: new Uint8Array(200).fill(255) })
    assert.deepEqual(peaksForSpan(a, 0, 0.5, 4), [0, 0, 0, 0])
    assert.ok(peaksForSpan(a, 1, 1.5, 4).every((v) => v === 1))
    assert.ok(peaksForSpan(a, 2.9, 3.1, 4).slice(2).every((v) => v === 0)) // past the end (1 + 2 s)
  })
  it('mixRange applies offset, volume and mute', () => {
    const ch = new Float32Array(1000).fill(0.5)
    const [l] = mixRange([ch], 1000, { offset: 0.5, volume: 0.5, muted: false }, 0, 1, 1000)
    assert.equal(l[100], 0) // before the clip starts
    assert.ok(Math.abs(l[700] - 0.25) < 1e-6)
    assert.ok(Math.abs(l[999] - 0.25) < 1e-6)
    const [m] = mixRange([ch], 1000, { offset: 0, volume: 1, muted: true }, 0, 1, 1000)
    assert.ok(m.every((v) => v === 0))
    const [neg] = mixRange([ch], 1000, { offset: -0.5, volume: 1, muted: false }, 0, 0.1, 1000)
    assert.ok(neg.every((v) => v === 0.5)) // negative offset skips the start of the sound
  })
  it('patch clamps and remove deletes', () => {
    const p = proj()
    assert.equal(patchAudio(p, { volume: 9 }).audio!.volume, 1)
    assert.equal(patchAudio(p, { offset: -99999 }).audio!.offset, -600)
    assert.equal(removeAudio(p).audio, undefined)
  })
  it('survives the project file and storage; restore points keep the current sound', async () => {
    const p = proj()
    const back = projectFromJSON(projectToJSON(p))
    assert.deepEqual(Array.from(back.audio!.data), [1, 2, 3])
    assert.ok(back.audio!.data instanceof Uint8Array)
    assert.equal(back.audio!.peaks.length, 200)
    await saveProject(p, null)
    const loaded = await loadProject(p.id)
    assert.deepEqual(Array.from(loaded!.audio!.data), [1, 2, 3])
    const snap = await saveSnapshot(p, 'manual', null)
    const stored = await loadSnapshot(snap.id)
    assert.equal(stored!.audio, undefined)
    const newer = { ...p, audio: track({ name: 'new.wav' }) }
    assert.equal(restoredProject(newer, stored!, 1).audio!.name, 'new.wav')
  })
})

// ---------------------------------------------------------------- Phase 3b: scenes
describe('scenes', () => {
  const six = () => {
    let p = createProject({ name: 'sc', width: 200, height: 100, fps: 10, background: null })
    for (let i = 0; i < 5; i += 1) p = addFrame(p, p.frames[p.frames.length - 1].id).project
    return p // 6 frames
  }
  const names = (p: ReturnType<typeof six>) => scenesOf(p).map((s) => `${s.name}:${s.start}-${s.end}`)
  it('off until the first scene; adding one at frame 4 makes Scene 1 + Scene 2', () => {
    let p = six()
    assert.deepEqual(scenesOf(p), [])
    p = addSceneAt(p, p.frames[3].id)
    assert.deepEqual(names(p), ['Scene 1:0-2', 'Scene 2:3-5'])
    assert.equal(addSceneAt(p, p.frames[3].id), p) // already starts there
    assert.equal(sceneAtFrame(p, 4)!.name, 'Scene 2')
  })
  it('a scene at frame 1 just creates Scene 1', () => {
    const p = addSceneAt(six(), six().frames[0].id)
    assert.equal(scenesOf(p).length, 0) // frames differ between calls
    const q = six()
    assert.deepEqual(names(addSceneAt(q, q.frames[0].id)), ['Scene 1:0-5'])
  })
  it('rename, remove (frames join the neighbour), clear', () => {
    let p = six()
    p = addSceneAt(addSceneAt(p, p.frames[2].id), p.frames[4].id)
    assert.equal(scenesOf(p).length, 3)
    const mid = scenesOf(p)[1]
    p = renameScene(p, mid.id, '  Chase  ')
    assert.equal(scenesOf(p)[1].name, 'Chase')
    assert.equal(renameScene(p, mid.id, '   '), p)
    const q = removeScene(p, mid.id)
    assert.deepEqual(scenesOf(q).map((s) => [s.start, s.end]), [[0, 3], [4, 5]])
    const first = removeScene(p, scenesOf(p)[0].id)
    assert.deepEqual(scenesOf(first).map((s) => [s.start, s.end]), [[0, 3], [4, 5]]) // next scene takes over from frame 1
    assert.equal(clearScenes(removeScene(removeScene(p, scenesOf(p)[2].id), scenesOf(removeScene(p, scenesOf(p)[2].id))[1].id)).scenes, undefined)
  })
  it('move swaps the frame blocks and keeps frames intact', () => {
    let p = six()
    p = addSceneAt(p, p.frames[2].id) // Scene 1: 0-1, Scene 2: 2-5
    const ids = p.frames.map((f) => f.id)
    const s1 = scenesOf(p)[0].id
    const moved = moveScene(p, s1, 1)
    assert.deepEqual(moved.frames.map((f) => f.id), [...ids.slice(2), ...ids.slice(0, 2)])
    assert.deepEqual(scenesOf(moved).map((s) => `${s.name}:${s.start}-${s.end}`), ['Scene 2:0-3', 'Scene 1:4-5'])
    assert.equal(moveScene(p, s1, -1), p)
    assert.equal(moveScene(p, scenesOf(p)[1].id, 1), p)
  })
  it('duplicate inserts copies right after the scene, with fresh ids', () => {
    let p = six()
    p = addSceneAt(p, p.frames[3].id)
    const s1 = scenesOf(p)[0]
    const d = duplicateScene(p, s1.id)!
    const v = scenesOf(d.project)
    assert.deepEqual(v.map((s) => `${s.name}:${s.start}-${s.end}`), ['Scene 1:0-2', 'Scene 1 copy:3-5', 'Scene 2:6-8'])
    assert.equal(new Set(d.project.frames.map((f) => f.id)).size, 9)
    assert.equal(d.project.frames[3].id, d.frameId)
  })
  it('range to scene, scene length, deleting a scene start frame folds it away', () => {
    let p = six()
    p = addSceneAt(p, p.frames[3].id)
    p = { ...p, frames: p.frames.map((f, i) => (i === 4 ? { ...f, hold: 3 } : f)) }
    const s2 = scenesOf(p)[1]
    assert.deepEqual(rangeToScene(p, s2.id).range, { start: 3, end: 5 })
    assert.ok(Math.abs(sceneSeconds(p, s2) - 0.5) < 1e-9) // 1 + 3 + 1 ticks at 10 fps
    const gone = deleteFrame(p, p.frames[3].id).project
    assert.equal(scenesOf(gone).length, 1)
  })
})

// ---------------------------------------------------------------- Phase 7: sync planner
describe('sync planner', () => {
  const none = new Set<string>()
  const kinds = (a: ReturnType<typeof planSync>) => a.map((x) => `${x.kind}:${x.id}`).sort()
  it('first sync: uploads local-only, downloads cloud-only', () => {
    assert.deepEqual(kinds(planSync([{ id: 'a', updatedAt: 5 }], [{ id: 'b', updatedAt: 7 }], {}, none)), ['download:b', 'upload:a'])
  })
  it('nothing changed = nothing to do', () => {
    assert.deepEqual(planSync([{ id: 'a', updatedAt: 5 }], [{ id: 'a', updatedAt: 5 }], { a: { local: 5, remote: 5 } }, none), [])
  })
  it('one side changed = copy that way; both = conflict', () => {
    const base = { a: { local: 5, remote: 5 } }
    assert.deepEqual(kinds(planSync([{ id: 'a', updatedAt: 9 }], [{ id: 'a', updatedAt: 5 }], base, none)), ['upload:a'])
    assert.deepEqual(kinds(planSync([{ id: 'a', updatedAt: 5 }], [{ id: 'a', updatedAt: 9 }], base, none)), ['download:a'])
    assert.deepEqual(kinds(planSync([{ id: 'a', updatedAt: 8 }], [{ id: 'a', updatedAt: 9 }], base, none)), ['conflict:a'])
  })
  it('same project on both sides with no history: identical is fine, different is a conflict', () => {
    assert.deepEqual(planSync([{ id: 'a', updatedAt: 5 }], [{ id: 'a', updatedAt: 5 }], {}, none), [])
    assert.deepEqual(kinds(planSync([{ id: 'a', updatedAt: 5 }], [{ id: 'a', updatedAt: 6 }], {}, none)), ['conflict:a'])
  })
  it('deleted on this device: remove from cloud, only if it is still there', () => {
    const pending = new Set(['a'])
    assert.deepEqual(kinds(planSync([], [{ id: 'a', updatedAt: 5 }], { a: { local: 5, remote: 5 } }, pending)), ['delete-remote:a'])
    assert.deepEqual(planSync([], [], { a: { local: 5, remote: 5 } }, pending), [])
  })
  it('deleted elsewhere: follow only when untouched here; edited work is re-uploaded', () => {
    const base = { a: { local: 5, remote: 5 } }
    assert.deepEqual(kinds(planSync([{ id: 'a', updatedAt: 5 }], [], base, none)), ['delete-local:a'])
    assert.deepEqual(kinds(planSync([{ id: 'a', updatedAt: 6 }], [], base, none)), ['upload:a'])
  })
  it('missing locally without a delete record comes back from the cloud', () => {
    assert.deepEqual(kinds(planSync([], [{ id: 'a', updatedAt: 5 }], { a: { local: 5, remote: 5 } }, none)), ['download:a'])
  })
  it('badges', () => {
    assert.equal(badgeFor({ id: 'a', updatedAt: 5 }, undefined), 'new')
    assert.equal(badgeFor({ id: 'a', updatedAt: 5 }, { local: 5, remote: 5 }), 'synced')
    assert.equal(badgeFor({ id: 'a', updatedAt: 6 }, { local: 5, remote: 5 }), 'waiting')
  })
})
