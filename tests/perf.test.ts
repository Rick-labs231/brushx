import test from 'node:test'
import assert from 'node:assert/strict'
import { autosaveDelay } from '../src/state/autosaveDelay.ts'

test('autosave waits 0.9 s for small projects', () => {
  assert.equal(autosaveDelay(0), 900)
  assert.equal(autosaveDelay(100), 900)
})

test('autosave waits longer after slow saves, up to 5 s', () => {
  assert.equal(autosaveDelay(500), 2000)
  assert.equal(autosaveDelay(60000), 5000)
})

test('autosave delay survives bad numbers', () => {
  assert.equal(autosaveDelay(NaN), 900)
  assert.equal(autosaveDelay(-5), 900)
})

import { frameLayersKey } from '../src/engine/render.ts'
import { createLayer, createFrame, createProject } from '../src/engine/projectOps.ts'

test('adding an empty layer does not change how existing frames are keyed', () => {
  const p = createProject({ name: 't', width: 320, height: 240, fps: 12, background: '#ffffff' })
  const f = p.frames[0]
  const before = frameLayersKey(p, f)
  const withEmpty = { ...p, layers: [...p.layers, createLayer('New')] }
  assert.equal(frameLayersKey(withEmpty, f), before)
})

test('a layer with strokes on the frame does change its key when hidden', () => {
  const p = createProject({ name: 't', width: 320, height: 240, fps: 12, background: '#ffffff' })
  const layer = p.layers[0]
  const stroke = { id: 's1', tool: 'pencil', color: '#000', size: 4, opacity: 1, points: [{ x: 1, y: 1, p: 1 }] } as never
  const f = { ...createFrame(), cels: { [layer.id]: [stroke] } }
  const shown = frameLayersKey(p, f)
  const hidden = frameLayersKey({ ...p, layers: [{ ...layer, visible: false }, ...p.layers.slice(1)] }, f)
  assert.notEqual(shown, hidden)
})
