import { figureShapes } from './figure.ts'
import { POSES } from './cycles.ts'
import { headShapes } from './head.ts'
import { box, circ, curve, ell, joint, line, poly, quadAt, type GuideShape, type V } from './shapes.ts'

export type TemplateCategory = 'Anatomy' | 'Poses' | 'Animals' | 'Objects' | 'Environment'
export const CATEGORIES: TemplateCategory[] = ['Anatomy', 'Poses', 'Animals', 'Objects', 'Environment']

export interface TemplateDef {
  id: string
  title: string
  category: TemplateCategory
  /** how the animator uses it */
  description: string
  shapes: GuideShape[]
  /** adjustable-angle templates rebuild their lines from yaw/pitch */
  build?: (a: { yaw: number; pitch: number }) => GuideShape[]
}

const T = (id: string, title: string, category: TemplateCategory, description: string, shapes: GuideShape[]): TemplateDef => ({ id, title, category, description, shapes })

const bodyU = 0.9 / 8
const bodyTop = -0.45
const jumpArc: [V, V, V] = [[-0.38, 0.28], [0, -0.4], [0.38, 0.28]]
const ground = (y: number) => line([-0.45, y], [0.45, y])
const grid = (n: number, f: (i: number) => GuideShape) => Array.from({ length: n }, (_, i) => f(i))

// -------------------------------------------------------------- anatomy
const anatomy: TemplateDef[] = [
  { ...T('head-adjustable', 'Head – turnable', 'Anatomy', 'Sphere-and-planes head. Drag Yaw and Pitch to any angle, then roll with Rotate', headShapes(35, 0)), build: ({ yaw, pitch }) => headShapes(yaw, pitch) },
  T('head-front', 'Head – Front', 'Anatomy', 'Cranium, jaw, centre line and feature lines', [
    ell(0, -0.1, 0.2, 0.2), curve([-0.2, -0.1], [-0.17, 0.2], [0, 0.23]), curve([0.2, -0.1], [0.17, 0.2], [0, 0.23]),
    line([0, -0.34], [0, 0.3]), line([-0.24, -0.1], [0.24, -0.1]), line([-0.2, -0.18], [0.2, -0.18]), line([-0.1, 0.03], [0.1, 0.03]), line([-0.08, 0.12], [0.08, 0.12]),
    ell(-0.085, -0.1, 0.045, 0.022), ell(0.085, -0.1, 0.045, 0.022), line([-0.07, 0.2], [-0.07, 0.34]), line([0.07, 0.2], [0.07, 0.34]),
  ]),
  T('head-three-quarter', 'Head – Three-quarter', 'Anatomy', 'Turned head with curved centre and eye lines', [
    ell(0, -0.1, 0.2, 0.2), curve([0.06, -0.3], [0.15, -0.08], [0.07, 0.22]), curve([-0.2, -0.1], [-0.02, -0.03], [0.2, -0.12]), curve([-0.19, -0.19], [-0.01, -0.12], [0.18, -0.21]),
    curve([-0.2, -0.04], [-0.16, 0.2], [0.07, 0.23]), curve([0.2, -0.06], [0.2, 0.1], [0.07, 0.23]), curve([-0.06, 0.04], [0.04, 0.07], [0.12, 0.04]), ell(-0.215, -0.04, 0.025, 0.055),
    line([0.04, 0.2], [0.02, 0.34]), line([-0.09, 0.17], [-0.1, 0.34]),
  ]),
  T('head-side', 'Head – Profile', 'Anatomy', 'Cranial ball, jaw wedge and ear placement for a side view', [
    circ(-0.02, -0.12, 0.19), line([0.12, -0.02], [0.2, 0.04], [0.14, 0.2], [-0.02, 0.22]), line([-0.2, 0.0], [-0.1, 0.2], [0.0, 0.22]), line([-0.22, -0.1], [0.24, -0.1]),
    line([-0.2, -0.17], [0.19, -0.17]), line([0.15, -0.1], [0.24, 0.02], [0.17, 0.04]), ell(-0.07, -0.02, 0.035, 0.07), line([-0.12, 0.18], [-0.12, 0.36]), line([0.04, 0.2], [0.02, 0.36]),
  ]),
  T('eye', 'Eye', 'Anatomy', 'Lids, iris, brow and the lines that place them', [
    ell(0, 0, 0.2, 0.1), curve([-0.2, 0], [0, -0.2], [0.2, 0]), curve([-0.2, 0], [0, 0.12], [0.2, 0]), curve([-0.2, -0.08], [0, -0.3], [0.2, -0.08]), curve([-0.22, -0.18], [0, -0.38], [0.24, -0.16]),
    circ(0, 0, 0.07), circ(0, 0, 0.03), ell(-0.18, 0, 0.02, 0.015), line([-0.3, 0], [0.3, 0]), line([0, -0.34], [0, 0.2]),
  ]),
  T('nose', 'Nose', 'Anatomy', 'Bridge, ball and wings in front view', [
    line([0, -0.35], [0, 0.22]), line([-0.04, -0.3], [-0.06, 0.05]), line([0.04, -0.3], [0.06, 0.05]), ell(0, 0.1, 0.06, 0.05), ell(-0.09, 0.13, 0.035, 0.03), ell(0.09, 0.13, 0.035, 0.03),
    line([-0.12, 0.18], [0.12, 0.18]), line([-0.2, -0.3], [0.2, -0.3]),
  ]),
  T('mouth', 'Mouth', 'Anatomy', 'Lip construction on a corner-to-corner line', [
    line([-0.25, 0], [0.25, 0]), curve([-0.25, 0], [-0.12, -0.12], [0, -0.05]), curve([0, -0.05], [0.12, -0.12], [0.25, 0]), curve([-0.25, 0], [0, 0.2], [0.25, 0]), line([0, -0.2], [0, 0.25]),
    line([-0.27, -0.03], [-0.27, 0.03]), line([0.27, -0.03], [0.27, 0.03]),
  ]),
  T('ear', 'Ear', 'Anatomy', 'Side view with brow and nose-base guide lines', [
    ell(0, 0, 0.12, 0.2), curve([-0.08, -0.1], [0.12, -0.2], [0.1, 0.05]), ell(0.01, 0.02, 0.06, 0.12), ell(0, 0.18, 0.04, 0.04), line([-0.25, -0.2], [0.25, -0.2]), line([-0.25, 0.2], [0.25, 0.2]),
  ]),
  T('hair', 'Hair masses', 'Anatomy', 'Head with a hairline and big hair shapes to carve from', [
    ell(0, 0, 0.18, 0.2), curve([-0.17, -0.06], [0, -0.2], [0.17, -0.06]), line([0, -0.2], [0, -0.05]), curve([-0.2, -0.05], [-0.34, -0.28], [0, -0.32]), curve([0, -0.32], [0.34, -0.28], [0.2, -0.05]),
    curve([-0.2, -0.05], [-0.3, 0.12], [-0.2, 0.28]), curve([0.2, -0.05], [0.3, 0.12], [0.2, 0.28]),
  ]),
  T('hand', 'Hand', 'Anatomy', 'Palm block with segmented fingers and thumb', [
    box(-0.12, 0, 0.24, 0.22), ...grid(4, (i) => line([-0.09 + i * 0.06, 0], [-0.09 + i * 0.06, -0.12 - (i === 1 || i === 2 ? 0.03 : 0)], [-0.09 + i * 0.06, -0.2 - (i === 1 || i === 2 ? 0.04 : 0)], [-0.09 + i * 0.06, -0.26 - (i === 1 || i === 2 ? 0.04 : 0)])),
    line([-0.12, 0.1], [-0.22, -0.02], [-0.27, -0.12]), line([-0.1, 0.22], [-0.07, 0.4]), line([0.1, 0.22], [0.07, 0.4]), ...grid(4, (i) => joint(-0.09 + i * 0.06, -0.12)),
  ]),
  T('foot', 'Foot', 'Anatomy', 'Side view: ankle, arch, ball and toe block', [
    line([-0.2, 0.2], [0.26, 0.2]), curve([-0.2, 0.2], [-0.22, 0.04], [-0.08, 0.0]), curve([-0.08, 0.0], [0.1, 0.1], [0.2, 0.14]), poly([0.2, 0.14], [0.28, 0.2], [0.1, 0.2]), line([-0.14, -0.3], [-0.14, 0.0]), line([-0.02, -0.3], [-0.02, -0.02]), circ(-0.08, -0.02, 0.025),
  ]),
  T('torso', 'Torso', 'Anatomy', 'Rib cage and pelvis blocks joined by the spine', [
    ell(0, -0.12, 0.16, 0.14), ell(0, 0.15, 0.12, 0.09), line([0, -0.3], [0, 0.26]), line([-0.22, -0.2], [0.22, -0.2]), line([-0.13, 0.12], [0.13, 0.12]), curve([-0.15, -0.04], [0, 0.04], [0.15, -0.04]),
    curve([-0.16, -0.1], [-0.12, 0.02], [-0.11, 0.08]), curve([0.16, -0.1], [0.12, 0.02], [0.11, 0.08]),
  ]),
  T('arm', 'Arm', 'Anatomy', 'Shoulder, elbow, wrist and hand as simple volumes', [
    circ(-0.28, -0.22, 0.05), line([-0.28, -0.22], [-0.12, -0.02], [0.08, 0.1]), circ(-0.12, -0.02, 0.035), circ(0.08, 0.1, 0.025), ell(0.17, 0.14, 0.07, 0.04), ell(-0.2, -0.12, 0.09, 0.045), ell(-0.02, 0.04, 0.09, 0.035),
  ]),
  T('leg', 'Leg', 'Anatomy', 'Hip, knee and ankle with thigh and calf masses', [
    circ(0, -0.3, 0.06), line([0, -0.3], [0.04, -0.02], [0, 0.26]), circ(0.04, -0.02, 0.04), circ(0, 0.26, 0.025), ell(0.02, -0.16, 0.07, 0.15), ell(0.02, 0.12, 0.05, 0.13), line([-0.06, 0.3], [0.14, 0.3]),
  ]),
  { id: 'body-proportions', title: 'Body – 8 heads', category: 'Anatomy', description: 'Standing figure split into eight head units', shapes: [
    ell(0, bodyTop + bodyU / 2, bodyU * 0.38, bodyU / 2), ...Array.from({ length: 9 }, (_, k) => line([-0.2, bodyTop + k * bodyU], [0.2, bodyTop + k * bodyU])),
    line([0, bodyTop + bodyU], [0, bodyTop + bodyU * 4]), line([-0.14, bodyTop + bodyU * 1.4], [0.14, bodyTop + bodyU * 1.4]), line([-0.09, bodyTop + bodyU * 3.8], [0.09, bodyTop + bodyU * 3.8]),
    line([-0.14, bodyTop + bodyU * 1.4], [-0.2, bodyTop + bodyU * 3.1], [-0.22, bodyTop + bodyU * 4.1]), line([0.14, bodyTop + bodyU * 1.4], [0.2, bodyTop + bodyU * 3.1], [0.22, bodyTop + bodyU * 4.1]),
    line([-0.09, bodyTop + bodyU * 3.8], [-0.1, bodyTop + bodyU * 6], [-0.1, bodyTop + bodyU * 8]), line([0.09, bodyTop + bodyU * 3.8], [0.1, bodyTop + bodyU * 6], [0.1, bodyTop + bodyU * 8]),
  ] },
]

// ---------------------------------------------------------------- poses
const poseOf = (id: string, title: string, description: string, key: keyof typeof POSES, extra: GuideShape[] = []): TemplateDef =>
  T(id, title, 'Poses', description, [...figureShapes(POSES[key]), ...extra])

const poses: TemplateDef[] = [
  poseOf('pose-standing', 'Standing', 'Relaxed stance. The starting point for most animation', 'standing'),
  poseOf('pose-walking', 'Walking', 'Contact pose: heel strike, arms opposite the legs', 'walking'),
  poseOf('pose-running', 'Running', 'Forward lean, bent arms, one foot always leaving the ground', 'running'),
  poseOf('pose-jumping', 'Jumping', 'Peak of a jump with the legs tucked', 'jumping'),
  poseOf('pose-sitting', 'Sitting', 'Seated on a chair block', 'sitting', [box(-0.14, 0.12, 0.2, 0.04), line([-0.14, 0.16], [-0.14, 0.34]), line([0.06, 0.16], [0.06, 0.34])]),
  poseOf('pose-kneeling', 'Kneeling', 'One knee down, the other foot planted', 'kneeling'),
  poseOf('pose-falling', 'Falling', 'Off balance, arms flung out', 'falling'),
  poseOf('pose-fighting', 'Fighting stance', 'Guard up, feet apart, weight low', 'fighting'),
  poseOf('pose-reaching', 'Reaching', 'Arm stretched up and forward', 'reaching'),
  poseOf('pose-turning', 'Turning', 'Head leads the turn, shoulders follow', 'turning'),
  T('jump-arc', 'Jump – Arc & spacing', 'Poses', 'Parabolic path with even timing ticks', [
    { k: 'curve', p: jumpArc }, line([-0.45, 0.28], [0.45, 0.28]), line([0, quadAt(jumpArc, 0.5)[1]], [0, 0.28]),
    ...Array.from({ length: 9 }, (_, i) => { const [x, y] = quadAt(jumpArc, i / 8); return ell(x, y, 0.012, 0.012) }),
  ]),
]

// -------------------------------------------------------------- animals
const legs = (hx: number, hy: number, kx: number, ky: number, fx: number, fy: number): GuideShape[] => [line([hx, hy], [kx, ky], [fx, fy]), joint(kx, ky)]
const animals: TemplateDef[] = [
  T('dog', 'Dog', 'Animals', 'Chest and hip masses on a spine curve, four-joint legs', [
    ell(0.14, -0.02, 0.12, 0.13), ell(-0.2, 0, 0.1, 0.11), curve([-0.2, -0.1], [-0.02, -0.2], [0.14, -0.1]), ell(0.34, -0.15, 0.08, 0.07), ell(0.43, -0.11, 0.05, 0.035), line([0.22, -0.1], [0.3, -0.14]),
    poly([0.3, -0.22], [0.34, -0.3], [0.38, -0.21]), ...legs(0.15, 0.08, 0.2, 0.22, 0.18, 0.36), ...legs(0.1, 0.1, 0.1, 0.22, 0.09, 0.36), ...legs(-0.2, 0.1, -0.12, 0.22, -0.2, 0.36), ...legs(-0.25, 0.1, -0.22, 0.24, -0.26, 0.36),
    curve([-0.29, -0.04], [-0.4, -0.12], [-0.4, -0.24]), ground(0.36),
  ]),
  T('cat', 'Cat', 'Animals', 'Compact body, long tail, triangle ears', [
    ell(0.08, -0.02, 0.1, 0.1), ell(-0.18, 0.02, 0.09, 0.1), curve([-0.18, -0.08], [-0.04, -0.16], [0.08, -0.1]), circ(0.26, -0.12, 0.07), poly([0.21, -0.17], [0.22, -0.27], [0.27, -0.19]), poly([0.28, -0.19], [0.32, -0.27], [0.32, -0.15]),
    ...legs(0.1, 0.06, 0.13, 0.2, 0.12, 0.34), ...legs(0.04, 0.08, 0.04, 0.2, 0.03, 0.34), ...legs(-0.18, 0.08, -0.1, 0.2, -0.18, 0.34), ...legs(-0.22, 0.08, -0.2, 0.22, -0.24, 0.34),
    curve([-0.26, 0], [-0.46, 0.02], [-0.42, -0.22]), ground(0.34),
  ]),
  T('horse', 'Horse', 'Animals', 'Barrel body, arched neck and long legs', [
    ell(0, -0.06, 0.2, 0.12), ell(-0.2, -0.04, 0.09, 0.12), ell(0.18, -0.08, 0.1, 0.11), curve([0.2, -0.16], [0.28, -0.3], [0.3, -0.38]), ell(0.38, -0.34, 0.08, 0.05), line([0.3, -0.36], [0.44, -0.3]),
    ...legs(0.18, 0.02, 0.2, 0.18, 0.2, 0.4), ...legs(0.12, 0.04, 0.12, 0.2, 0.1, 0.4), ...legs(-0.2, 0.04, -0.12, 0.2, -0.18, 0.4), ...legs(-0.26, 0.04, -0.22, 0.22, -0.28, 0.4),
    curve([-0.28, -0.08], [-0.4, -0.04], [-0.38, 0.14]), ground(0.4),
  ]),
  T('bird', 'Bird', 'Animals', 'Egg body, wing sweep and tail fan', [
    ell(0, 0, 0.14, 0.1), circ(0.17, -0.1, 0.05), poly([0.21, -0.12], [0.3, -0.09], [0.21, -0.07]), curve([-0.04, -0.04], [-0.1, -0.24], [-0.26, -0.18]), curve([-0.04, -0.02], [-0.16, -0.12], [-0.28, -0.06]),
    line([-0.13, 0.02], [-0.3, 0.1]), line([-0.13, 0.04], [-0.28, 0.16]), line([0.02, 0.1], [0.02, 0.24]), line([0.06, 0.1], [0.06, 0.24]), line([-0.02, 0.24], [0.1, 0.24]),
  ]),
]

// -------------------------------------------------------------- objects
const wheel = (x: number, y: number, r: number): GuideShape[] => [circ(x, y, r), circ(x, y, r * 0.35), line([x - r, y], [x + r, y]), line([x, y - r], [x, y + r])]
const objects: TemplateDef[] = [
  T('car', 'Car (side)', 'Objects', 'Body block, cabin and wheels on a ground line', [
    line([-0.35, 0.1], [-0.35, -0.02], [-0.22, -0.04], [-0.12, -0.16], [0.14, -0.16], [0.26, -0.04], [0.37, -0.02], [0.37, 0.1], [-0.35, 0.1]), line([-0.1, -0.14], [-0.1, -0.04], [0.24, -0.04]), line([0.04, -0.15], [0.04, -0.04]),
    ...wheel(-0.2, 0.12, 0.08), ...wheel(0.22, 0.12, 0.08), ground(0.2),
  ]),
  T('bicycle', 'Bicycle', 'Objects', 'Two wheels, diamond frame, bars and saddle', [
    ...wheel(-0.2, 0.12, 0.14), ...wheel(0.2, 0.12, 0.14), line([-0.2, 0.12], [-0.04, -0.06], [0.14, -0.06], [0.2, 0.12]), line([-0.04, -0.06], [0.03, 0.12], [-0.2, 0.12]), line([0.03, 0.12], [0.14, -0.06]),
    line([0.14, -0.06], [0.12, -0.18], [0.18, -0.2]), line([-0.06, -0.08], [-0.08, -0.14]), line([-0.13, -0.14], [-0.02, -0.14]), circ(0.03, 0.12, 0.03), ground(0.26),
  ]),
  T('motorcycle', 'Motorcycle', 'Objects', 'Wheels, engine block, tank and handlebar', [
    ...wheel(-0.24, 0.12, 0.12), ...wheel(0.26, 0.12, 0.12), line([-0.24, 0.12], [-0.08, -0.04], [0.16, -0.04], [0.26, 0.12]), box(-0.06, -0.02, 0.18, 0.12), curve([-0.1, -0.1], [0.04, -0.2], [0.18, -0.08]), line([0.16, -0.04], [0.14, -0.2], [0.22, -0.22]),
    line([-0.22, -0.08], [-0.02, -0.08]), ground(0.24),
  ]),
  T('house', 'House', 'Objects', 'Box with roof, door and windows', [
    box(-0.25, -0.05, 0.5, 0.35), poly([-0.3, -0.05], [0, -0.28], [0.3, -0.05]), box(-0.05, 0.12, 0.1, 0.18), box(-0.2, 0.02, 0.1, 0.1), box(0.1, 0.02, 0.1, 0.1), box(0.14, -0.28, 0.05, 0.12), ground(0.3),
  ]),
  T('building', 'Building', 'Objects', 'Tall block with floor lines and a window grid', [
    box(-0.16, -0.4, 0.32, 0.7), ...grid(6, (i) => line([-0.16, -0.3 + i * 0.1], [0.16, -0.3 + i * 0.1])), ...grid(3, (i) => line([-0.053 + i * 0.053, -0.4], [-0.053 + i * 0.053, 0.2])), box(-0.04, 0.2, 0.08, 0.1), ground(0.3),
  ]),
  T('chair', 'Chair', 'Objects', 'Seat, back and four legs', [
    poly([-0.14, 0.02], [0.14, 0.02], [0.2, 0.08], [-0.08, 0.08]), line([-0.14, 0.02], [-0.14, -0.26], [0.14, -0.26], [0.14, 0.02]), line([-0.08, 0.08], [-0.08, 0.3]), line([0.2, 0.08], [0.2, 0.3]), line([-0.14, 0.02], [-0.14, 0.24]), line([0.14, 0.02], [0.14, 0.24]), ground(0.3),
  ]),
  T('phone', 'Phone', 'Objects', 'Rounded body, screen and camera', [
    line([-0.1, -0.22], [0.1, -0.22], [0.12, -0.2], [0.12, 0.2], [0.1, 0.22], [-0.1, 0.22], [-0.12, 0.2], [-0.12, -0.2], [-0.1, -0.22]), box(-0.1, -0.18, 0.2, 0.34), circ(0, 0.19, 0.012), line([-0.03, -0.2], [0.03, -0.2]),
  ]),
  T('computer', 'Computer', 'Objects', 'Monitor on a stand with a keyboard', [
    box(-0.22, -0.26, 0.44, 0.3), box(-0.19, -0.23, 0.38, 0.24), line([0, 0.04], [0, 0.12]), line([-0.08, 0.12], [0.08, 0.12]), poly([-0.2, 0.2], [0.2, 0.2], [0.24, 0.28], [-0.24, 0.28]),
  ]),
  T('tree', 'Tree', 'Objects', 'Trunk with overlapping crown masses', [
    line([-0.03, 0.3], [-0.04, 0], [-0.1, -0.1]), line([0.03, 0.3], [0.04, 0], [0.1, -0.1]), line([0, -0.02], [0.08, -0.16]), circ(0, -0.24, 0.16), circ(-0.14, -0.14, 0.12), circ(0.14, -0.14, 0.12), ground(0.3),
  ]),
  T('rock', 'Rock', 'Objects', 'Faceted block to shade as a solid', [
    poly([-0.22, 0.14], [-0.18, -0.02], [-0.06, -0.14], [0.1, -0.12], [0.2, 0.0], [0.24, 0.14]), line([-0.06, -0.14], [-0.02, 0.0], [0.1, -0.12]), line([-0.02, 0.0], [0.04, 0.14]), line([-0.18, -0.02], [-0.02, 0.0]), ground(0.14),
  ]),
  T('bag', 'Bag', 'Objects', 'Tapered body with handle and flap', [
    poly([-0.16, -0.1], [0.16, -0.1], [0.2, 0.2], [-0.2, 0.2]), curve([-0.08, -0.1], [0, -0.28], [0.08, -0.1]), curve([-0.16, -0.1], [0, 0.02], [0.16, -0.1]), box(-0.04, 0.0, 0.08, 0.06),
  ]),
]

// ---------------------------------------------------------- environment
const environment: TemplateDef[] = [
  T('room-one-point', 'Room – One-point', 'Environment', 'Back wall and corner rays to a central vanishing point', [
    line([-0.6, -0.05], [0.6, -0.05]), line([-0.18, -0.17], [0.18, -0.17], [0.18, 0.07], [-0.18, 0.07], [-0.18, -0.17]), line([-0.18, -0.17], [-0.6, -0.6]), line([0.18, -0.17], [0.6, -0.6]),
    line([0.18, 0.07], [0.6, 0.6]), line([-0.18, 0.07], [-0.6, 0.6]), ell(0, -0.05, 0.012, 0.012),
  ]),
  T('street', 'Street – Two-point', 'Environment', 'Corner building and road with two vanishing points on the horizon', [
    line([-0.5, -0.1], [0.5, -0.1]), line([0, -0.34], [0, 0.1]), line([0, -0.34], [-0.5, -0.2]), line([0, -0.34], [0.5, -0.24]), line([0, 0.1], [-0.5, -0.02]), line([0, 0.1], [0.5, -0.02]),
    line([-0.2, 0.3], [0.0, 0.12], [0.3, 0.3]), ell(-0.5, -0.1, 0.012, 0.012), ell(0.5, -0.1, 0.012, 0.012),
  ]),
  T('floor-grid', 'Floor – Tile grid', 'Environment', 'Receding floor tiles for placing characters in a space', [
    line([-0.6, -0.1], [0.6, -0.1]), ...grid(9, (i) => line([0, -0.1], [-0.6 + i * 0.15, 0.5])), ...grid(5, (i) => line([-0.6 + (i * 0.04), -0.1 + 0.1 + i * 0.1 + (i * i) * 0.01], [0.6 - i * 0.04, -0.1 + 0.1 + i * 0.1 + (i * i) * 0.01])),
  ]),
]

export const CATALOG: TemplateDef[] = [...anatomy, ...poses, ...animals, ...objects, ...environment]
