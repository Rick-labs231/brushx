import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pickDefaultKind } from '../src/state/exportPrefs.ts'
import { watermarkBox } from '../src/engine/watermark.ts'

describe('export defaults', () => {
  it('a single drawing opens on PNG, an animation on video', () => {
    assert.equal(pickDefaultKind(1, null), 'png')
    assert.equal(pickDefaultKind(1, 'video'), 'png')
    assert.equal(pickDefaultKind(8, null), 'video')
    assert.equal(pickDefaultKind(8, 'png'), 'video')
    assert.equal(pickDefaultKind(8, 'gif'), 'gif')
    assert.equal(pickDefaultKind(8, 'seq'), 'seq')
    assert.equal(pickDefaultKind(8, 'nonsense'), 'video')
  })
})

describe('watermark placement', () => {
  const text = (u: number) => u * 3.6
  it('sits inside the bottom-right corner for every common frame size', () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920], [1080, 1080], [640, 360], [200, 120]]) {
      const b = watermarkBox(w, h, text)
      assert.ok(b.x >= 0 && b.y >= 0, `${w}x${h} starts inside`)
      assert.ok(b.x + b.w <= w && b.y + b.h <= h, `${w}x${h} ends inside`)
      assert.ok(b.x > w / 2 && b.y > h / 2, `${w}x${h} is in the bottom-right quarter`)
    }
  })
  it('never leaves the frame, even for a tiny one', () => {
    const b = watermarkBox(64, 64, text)
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 64 && b.y + b.h <= 64)
  })
  it('stays small: under a third of the width on landscape frames', () => {
    const b = watermarkBox(1920, 1080, text)
    assert.ok(b.w < 1920 / 3)
    assert.ok(b.h < 1080 / 10)
  })
})
