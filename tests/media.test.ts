import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CLIP_BYTE_BUDGET, MAX_CLIP_FRAMES, addMediaLayer, bitmapStroke, containRect, placeOnFrames, planClip } from '../src/engine/media.ts'
import { createProject } from '../src/engine/projectOps.ts'
import { strokeBounds, transformStroke, matrixTranslate } from '../src/engine/geometry.ts'

const proj = () => createProject({ name: 'T', width: 1280, height: 720, fps: 12, background: '#ffffff' })

describe('media', () => {
  it('contains a portrait picture centred in a landscape canvas', () => {
    const r = containRect(100, 200, 1280, 720)
    assert.equal(Math.round(r.h), 720)
    assert.equal(Math.round(r.w), 360)
    assert.equal(Math.round(r.x), 460)
  })
  it('plans one frame per tick of video and caps long clips', () => {
    assert.equal(planClip(2, 12, 1280, 720, 1280, 720).count, 24)
    assert.equal(planClip(600, 12, 1280, 720, 1280, 720).count, MAX_CLIP_FRAMES)
  })
  it('keeps clip pixels inside the byte budget', () => {
    const p = planClip(20, 12, 1920, 1080, 1280, 720)
    assert.ok(p.count * p.px.w * p.px.h * 4 <= CLIP_BYTE_BUDGET * 1.02)
    const small = planClip(1, 12, 320, 180, 1280, 720)
    assert.ok(small.px.w <= 320)
  })
  it('bitmap strokes report the displayed size and translate', () => {
    const s = bitmapStroke(new Uint8ClampedArray(4 * 4 * 4), 4, 4, { x: 10, y: 20, w: 400, h: 400 })
    assert.deepEqual(strokeBounds(s), { x: 10, y: 20, w: 400, h: 400 })
    const m = transformStroke(s, matrixTranslate(5, 5))
    assert.equal(m.bitmap?.x, 15)
    assert.equal(m.bitmap?.dw, 400)
  })
  it('media layers go to the bottom; reference ones are locked guides', () => {
    const p = proj()
    const r = addMediaLayer(p, 'Pic', true, [bitmapStroke(new Uint8ClampedArray(4), 1, 1, { x: 0, y: 0, w: 10, h: 10 })])
    assert.equal(r.project.layers[0].id, r.layerId)
    assert.equal(r.project.layers[0].guide, true)
    assert.equal(r.project.layers[0].locked, true)
    assert.equal(r.project.layers[0].base?.length, 1)
    const f = addMediaLayer(p, 'Pic', false)
    assert.equal(f.project.layers[0].guide, undefined)
  })
  it('places clip frames, extending the timeline when asked', () => {
    const p = proj()
    const { project, layerId } = addMediaLayer(p, 'V', true)
    const st = Array.from({ length: 5 }, () => bitmapStroke(new Uint8ClampedArray(4), 1, 1, { x: 0, y: 0, w: 4, h: 4 }))
    const a = placeOnFrames(project, layerId, 0, st, true)
    assert.equal(a.placed, 5)
    assert.equal(a.project.frames.length, Math.max(project.frames.length, 5))
    const b = placeOnFrames(project, layerId, 0, st, false)
    assert.equal(b.placed, Math.min(5, project.frames.length))
    assert.equal(b.project.frames.length, project.frames.length)
  })
})
