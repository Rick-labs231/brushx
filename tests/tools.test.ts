import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { flattenBezier } from '../src/engine/bezier.ts'
import { cropCanvas, createProject, resizeCanvas } from '../src/engine/projectOps.ts'
import { addMediaLayer, bitmapStroke } from '../src/engine/media.ts'

const proj = () => createProject({ name: 'T', width: 1280, height: 720, fps: 12, background: '#ffffff' })

describe('bezier', () => {
  it('straight anchors give a straight polyline', () => {
    const pts = flattenBezier([{ x: 0, y: 0, hx: 0, hy: 0 }, { x: 100, y: 0, hx: 0, hy: 0 }], false)
    assert.equal(pts.length, 2)
  })
  it('handles bend the path and it passes through the anchors', () => {
    const pts = flattenBezier([{ x: 0, y: 0, hx: 0, hy: 80 }, { x: 100, y: 0, hx: 0, hy: -80 }], false)
    assert.ok(pts.length > 10)
    assert.deepEqual([pts[0].x, pts[0].y], [0, 0])
    const last = pts[pts.length - 1]
    assert.ok(Math.abs(last.x - 100) < 1e-9 && Math.abs(last.y) < 1e-9)
    assert.ok(pts.some((p) => Math.abs(p.y) > 20))
  })
  it('closing adds the segment back to the start', () => {
    const a = [{ x: 0, y: 0, hx: 0, hy: 0 }, { x: 100, y: 0, hx: 0, hy: 0 }, { x: 100, y: 100, hx: 0, hy: 0 }]
    const open = flattenBezier(a, false)
    const closed = flattenBezier(a, true)
    assert.equal(closed.length, open.length + 1)
    assert.deepEqual([closed[closed.length - 1].x, closed[closed.length - 1].y], [0, 0])
  })
  it('one anchor is just a dot, none is empty', () => {
    assert.equal(flattenBezier([{ x: 5, y: 5, hx: 0, hy: 0 }], false).length, 1)
    assert.equal(flattenBezier([], false).length, 0)
  })
})

describe('crop', () => {
  it('sets the size and moves the artwork', () => {
    const p = proj()
    const layer = p.layers[1] ?? p.layers[0]
    const f = p.frames[0]
    const st = bitmapStroke(new Uint8ClampedArray(4), 1, 1, { x: 500, y: 300, w: 10, h: 10 })
    const withArt = { ...p, frames: [{ ...f, cels: { ...f.cels, [layer.id]: [st] } }, ...p.frames.slice(1)] }
    const c = cropCanvas(withArt, 400, 200, 640, 360)
    assert.equal(c.width, 640)
    assert.equal(c.height, 360)
    const moved = c.frames[0].cels[layer.id][0]
    assert.equal(moved.bitmap?.x, 100)
    assert.equal(moved.bitmap?.y, 100)
  })
  it('clamps tiny crops to the minimum size', () => {
    assert.equal(cropCanvas(proj(), 0, 0, 10, 10).width, 64)
  })
  it('moves picture layers too, and resizing does as well', () => {
    const { project } = addMediaLayer(proj(), 'P', true, [bitmapStroke(new Uint8ClampedArray(4), 1, 1, { x: 100, y: 100, w: 50, h: 50 })])
    const c = cropCanvas(project, 100, 100, 640, 360)
    assert.equal(c.layers[0].base?.[0].bitmap?.x, 0)
    const r = resizeCanvas(project, 1480, 720, 0, 0.5)
    assert.equal(r.layers[0].base?.[0].bitmap?.x, 100)
    const r2 = resizeCanvas(project, 1480, 720, 1, 0.5)
    assert.equal(r2.layers[0].base?.[0].bitmap?.x, 300)
  })
  it('a crop to the same rectangle changes nothing', () => {
    const p = proj()
    assert.equal(cropCanvas(p, 0, 0, p.width, p.height), p)
  })
})

import { AUTO_SNAPSHOT_MAX_BYTES, bitmapBytes, hasArtwork, shouldAutoSnapshot } from '../src/engine/versions.ts'
describe('versions with pictures', () => {
  it('a picture layer counts as artwork and its bytes are counted once', () => {
    const shared = bitmapStroke(new Uint8ClampedArray(4000), 10, 100, { x: 0, y: 0, w: 10, h: 100 })
    const { project } = addMediaLayer(proj(), 'P', true, [shared])
    assert.equal(hasArtwork(project), true)
    const f = project.frames[0]
    const two = { ...project, frames: [{ ...f, cels: { ...f.cels, [project.layers[1].id]: [shared] } }] }
    assert.equal(bitmapBytes(two), 4000)
  })
  it('huge video projects skip automatic restore points', () => {
    const big = bitmapStroke(new Uint8ClampedArray(AUTO_SNAPSHOT_MAX_BYTES + 4), 1, 1, { x: 0, y: 0, w: 1, h: 1 })
    const { project } = addMediaLayer(proj(), 'V', true, [big])
    assert.equal(shouldAutoSnapshot(undefined, project, Date.now()), false)
  })
})
