// The small "Brush X" mark stamped in the bottom-right corner of video and GIF exports.
// It sits on a dark rounded pill so it stays readable on white and on dark art alike.

export interface WatermarkBox { x: number; y: number; w: number; h: number; unit: number }

/** Where the mark goes for a frame of w × h, given the measured text width at `unit` px. Always inside the frame. */
export function watermarkBox(w: number, h: number, textW: (unit: number) => number): WatermarkBox {
  const unit = Math.max(10, Math.round(Math.min(w, h) * 0.04))
  const padX = unit * 0.6
  const boxH = unit * 1.7
  const boxW = Math.min(w - 2, padX * 2 + unit * 1.05 + unit * 0.45 + textW(unit))
  const margin = unit * 0.8
  return { x: Math.max(0, w - boxW - margin), y: Math.max(0, h - boxH - margin), w: boxW, h: boxH, unit }
}

export function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save()
  ctx.font = '700 10px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  const per10 = ctx.measureText('Brush X').width
  const b = watermarkBox(w, h, (u) => (per10 * u) / 10)
  const u = b.unit
  ctx.globalAlpha = 0.72
  ctx.fillStyle = '#080A0F'
  ctx.beginPath()
  ctx.roundRect(b.x, b.y, b.w, b.h, b.h / 2)
  ctx.fill()
  ctx.globalAlpha = 0.95
  // the X mark, drawn on the same 32-unit grid as the app icon
  const s = (u * 1.05) / 32
  ctx.translate(b.x + u * 0.6, b.y + (b.h - u * 1.05) / 2)
  ctx.scale(s, s)
  ctx.lineWidth = 5.2
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#168CFF'
  ctx.beginPath(); ctx.moveTo(7, 6.5); ctx.bezierCurveTo(11, 11, 17, 21.5, 25, 26); ctx.stroke()
  ctx.strokeStyle = '#9B5CFF'
  ctx.beginPath(); ctx.moveTo(25.5, 5.5); ctx.bezierCurveTo(21, 10.5, 14, 21, 6.5, 26.5); ctx.stroke()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.font = `700 ${u}px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText('Brush X', b.x + u * 0.6 + u * 1.05 + u * 0.45, b.y + b.h / 2 + u * 0.04)
  ctx.restore()
}
