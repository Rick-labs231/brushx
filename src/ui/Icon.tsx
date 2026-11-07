import type { ReactNode } from 'react'

const P = (d: string, key?: string) => <path key={key ?? d} d={d} />
const C = (cx: number, cy: number, r: number, fill = false) => <circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} fill={fill ? 'currentColor' : 'none'} />

const ICONS = {
  pencil: [P('M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19z'), P('M14 7l3 3')],
  ink: [P('M12 3l6 10-6 8-6-8z'), C(12, 12, 1.6), P('M12 4v6.4')],
  brush: [P('M20 4L11 13'), P('M11 13c-3 0-5.5 2-5.5 5.5 3 0 5.5-2 5.5-5.5z'), P('M17 7l-3-3')],
  airbrush: [C(8, 8, 1, true), C(15, 6, 1, true), C(18, 12, 1, true), C(12, 13, 1, true), C(6, 14, 1, true), C(16, 18, 1, true), C(9, 19, 1, true), C(20, 5, 0.8, true)],
  marker: [P('M14 4l6 6-8 8H6v-6z'), P('M4 21h16'), P('M10 8l6 6')],
  chalk: [P('M6 18l10-12 3 2.5L9 20.5z'), P('M4 21h5')],
  crayon: [P('M4 20l2-5 9-9 3 3-9 9z'), P('M15 6l3 3'), P('M5.5 15.5l3 3')],
  eraser: [P('M5 14l8-8 6 6-8 8H8z'), P('M20 20H11'), P('M9 10l6 6')],
  fill: [P('M4 12l8-8 8 8-8 8z'), P('M8 8l8 8'), P('M20 16c0 1.6 1.2 2.2 1.2 3.4a1.2 1.2 0 01-2.4 0c0-1.2 1.2-1.8 1.2-3.4z')],
  pipette: [P('M16 4a2.1 2.1 0 013 3l-2.5 2.5-3-3z'), P('M13.5 7.5l3 3'), P('M13 8L4 17v3h3l9-9')],
  hand: [P('M8 12V5.5a1.5 1.5 0 013 0V11'), P('M11 4.5a1.5 1.5 0 013 0V11'), P('M14 6.5a1.5 1.5 0 013 0V13'), P('M17 9.5a1.5 1.5 0 013 0V15c0 4.5-3 7-6.5 7-3 0-4.5-1.5-6-4.2l-2-3.3a1.5 1.5 0 012.3-1.8L8 14')],
  select: [P('M5 3l14 7-6 2-2 6z')],
  lasso: [P('M12 4c5 0 9 2 9 5s-4 5-9 5-9-2-9-5 4-5 9-5z'), P('M9.5 13.8c-1.4 2.6.4 6.2 3.5 6.2')],
  line: [P('M5 19L19 5')],
  rect: [<rect key="r" x="4" y="6" width="16" height="12" rx="1.5" />],
  ellipse: [<ellipse key="e" cx="12" cy="12" rx="9" ry="6.5" />],
  polygon: [P('M12 3l8 6-3 11H7L4 9z')],
  bezier: [P('M4 18C8 4 16 4 20 18'), <circle key="a" cx="4" cy="18" r="1.6" />, <circle key="b" cx="20" cy="18" r="1.6" />],
  text: [P('M5 6V4h14v2'), P('M12 4v16'), P('M9 20h6')],
  crop: [P('M7 3v14h14'), P('M3 7h14v14')],
  symmetry: [P('M12 3v18'), P('M8 7l-4.5 5L8 17z'), P('M16 7l4.5 5L16 17z')],
  undo: [P('M3 8h11a6 6 0 010 12H8'), P('M7 4L3 8l4 4')],
  redo: [P('M21 8H10a6 6 0 000 12h6'), P('M17 4l4 4-4 4')],
  play: [P('M7 4l13 8-13 8z')],
  pause: [P('M7 4h3v16H7z'), P('M14 4h3v16h-3z')],
  skipBack: [P('M19 5L9 12l10 7z'), P('M5 5v14')],
  skipFwd: [P('M5 5l10 7-10 7z'), P('M19 5v14')],
  plus: [P('M12 5v14'), P('M5 12h14')],
  minus: [P('M5 12h14')],
  trash: [P('M4 7h16'), P('M9 7V4h6v3'), P('M6 7l1 13h10l1-13'), P('M10 11v6'), P('M14 11v6')],
  copy: [<rect key="c" x="9" y="9" width="11" height="11" rx="2" />, P('M5 15V6a2 2 0 012-2h9')],
  eye: [P('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z'), C(12, 12, 3)],
  eyeOff: [P('M2 12s4-7 10-7c2 0 3.8.7 5.3 1.7M22 12s-4 7-10 7c-2 0-3.8-.7-5.3-1.7'), P('M4 4l16 16'), P('M9.9 9.9a3 3 0 004.2 4.2')],
  lock: [<rect key="l" x="5" y="11" width="14" height="9" rx="2" />, P('M8 11V8a4 4 0 018 0v3')],
  unlock: [<rect key="l" x="5" y="11" width="14" height="9" rx="2" />, P('M8 11V8a4 4 0 017.6-1.8')],
  layers: [P('M12 3l9 5-9 5-9-5z'), P('M3 13l9 5 9-5')],
  chevronDown: [P('M6 9l6 6 6-6')],
  chevronUp: [P('M6 15l6-6 6 6')],
  chevronRight: [P('M9 6l6 6-6 6')],
  chevronLeft: [P('M15 6l-6 6 6 6')],
  download: [P('M12 4v11'), P('M7 11l5 5 5-5'), P('M5 20h14')],
  upload: [P('M12 16V5'), P('M7 9l5-5 5 5'), P('M5 20h14')],
  settings: [P('M4 7h9'), P('M19 7h1'), P('M4 17h1'), P('M11 17h9'), C(16, 7, 2.5), C(8, 17, 2.5)],
  home: [P('M4 11l8-7 8 7'), P('M6 10v10h12V10')],
  folder: [P('M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z')],
  users: [C(9, 8, 3), P('M3 20a6 6 0 0112 0'), C(17, 9, 2.5), P('M17 14a5 5 0 014 6')],
  store: [P('M4 9l1-5h14l1 5'), P('M4 9a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0A2.7 2.7 0 0020 9'), P('M5 12v8h14v-8')],
  user: [C(12, 8, 4), P('M4 21a8 8 0 0116 0')],
  search: [C(11, 11, 6.5), P('M20 20l-4.2-4.2')],
  bell: [P('M6 16v-5a6 6 0 0112 0v5l2 2H4z'), P('M10 21h4')],
  x: [P('M6 6l12 12'), P('M18 6L6 18')],
  check: [P('M5 12l5 5 9-10')],
  grid: [<rect key="g" x="4" y="4" width="16" height="16" rx="1" />, P('M4 9.3h16'), P('M4 14.7h16'), P('M9.3 4v16'), P('M14.7 4v16')],
  merge: [P('M7 4v5a5 5 0 005 5'), P('M17 4v5a5 5 0 01-5 5'), P('M12 14v7'), P('M9 18l3 3 3-3')],
  onion: [C(9, 12, 6), C(15, 12, 6)],
  flipH: [P('M12 3v18'), P('M8 7l-5 5 5 5z'), P('M16 7l5 5-5 5z')],
  flipV: [P('M3 12h18'), P('M7 8l5-5 5 5z'), P('M7 16l5 5 5-5z')],
  rotateCw: [P('M20 12a8 8 0 11-2.6-5.9'), P('M20 4v5h-5')],
  rotateCcw: [P('M4 12a8 8 0 102.6-5.9'), P('M4 4v5h5')],
  fit: [P('M4 9V4h5'), P('M20 9V4h-5'), P('M4 15v5h5'), P('M20 15v5h-5')],
  scaleUp: [P('M14 4h6v6'), P('M20 4l-7 7'), P('M10 20H4v-6'), P('M4 20l7-7')],
  scaleDown: [P('M20 4l-6 6'), P('M14 5v5h5'), P('M4 20l6-6'), P('M10 19v-5H5')],
  panel: [<rect key="p" x="3" y="4" width="18" height="16" rx="2" />, P('M15 4v16')],
  loop: [P('M17 2l4 4-4 4'), P('M3 11V9a3 3 0 013-3h15'), P('M7 22l-4-4 4-4'), P('M21 13v2a3 3 0 01-3 3H3')],
  keyboard: [<rect key="k" x="2" y="6" width="20" height="12" rx="2" />, P('M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10')],
  archive: [<rect key="a" x="3" y="4" width="18" height="5" rx="1" />, P('M5 9v10h14V9'), P('M10 13h4')],
  more: [C(5, 12, 1.4, true), C(12, 12, 1.4, true), C(19, 12, 1.4, true)],
  image: [<rect key="i" x="3" y="4" width="18" height="16" rx="2" />, C(9, 10, 1.8), P('M21 16l-5-5-8 8')],
  guide: [P('M4 20L12 4l8 16'), P('M7 14h10'), P('M12 4v16')],
  move: [P('M12 3v18'), P('M3 12h18'), P('M9 6l3-3 3 3'), P('M9 18l3 3 3-3'), P('M6 9l-3 3 3 3'), P('M18 9l3 3-3 3')],
  alert: [P('M12 3l10 18H2z'), P('M12 10v5'), P('M12 18h.01')],
  duplicate: [<rect key="d" x="8" y="8" width="12" height="12" rx="2" />, P('M4 16V6a2 2 0 012-2h10')],
} satisfies Record<string, ReactNode[]>

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  )
}

/** Brush X mark: two crossing strokes (drawing + motion) with a motion trail. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Brush X">
      <path d="M7 6.5C11 11 17 21.5 25 26" stroke="#168CFF" strokeWidth="5.2" strokeLinecap="round" fill="none" />
      <path d="M25.5 5.5C21 10.5 14 21 6.5 26.5" stroke="#9B5CFF" strokeWidth="5.2" strokeLinecap="round" fill="none" />
      <circle cx="28.4" cy="14.2" r="1.3" fill="#6DB8FF" />
      <circle cx="30.4" cy="18.3" r="0.9" fill="#6DB8FF" opacity="0.7" />
    </svg>
  )
}
