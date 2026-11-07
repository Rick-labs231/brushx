import { G, type Pt } from './draw'
import { drawHead } from './head'
import {
  FIGHT_POSE, JUMP_APEX, KICK_KEYS, KNEEL_POSE, PUNCH_KEYS, REACH_POSE, SIT_POSE, STAND, THROW_KEYS,
  blendKeys, drawFrontFigure, drawSideFigure, fallPose, idlePose, jumpPose, keyPoseName, landPose,
  runPose, walkPose, wavePose, type FigureFlags, type Pose,
} from './figure'

export interface ParamDef { id: string; label: string; min: number; max: number; step: number; value: number }

export type TemplateCategory = 'Human Anatomy' | 'Poses' | 'Motion Cycles' | 'Animals' | 'Objects'
export const CATEGORIES: TemplateCategory[] = ['Human Anatomy', 'Poses', 'Motion Cycles', 'Animals', 'Objects']

export interface TemplateDef {
  id: string
  name: string
  category: TemplateCategory
  group: string
  summary: string
  /** What the construction lines are for and how an animator uses them. */
  howTo: string
  params: ParamDef[]
  motion?: { frames: number; loop: boolean; preview: number }
  draw: (g: G, p: Record<string, number>, phase: number) => void
}

const prm = (id: string, label: string, min: number, max: number, step: number, value: number): ParamDef => ({ id, label, min, max, step, value })
const FIG_PARAMS = [
  prm('heads', 'Head count (proportion)', 6, 9, 0.1, 7.5),
  prm('masses', 'Show body masses', 0, 1, 1, 1),
  prm('action', 'Line of action', 0, 1, 1, 1),
  prm('ground', 'Ground line', 0, 1, 1, 1),
]
const flags = (p: Record<string, number>): FigureFlags => ({ masses: !!p.masses, action: !!p.action, ground: !!p.ground })

function sidePose(id: string, name: string, group: string, pose: Pose, summary: string, howTo: string): TemplateDef {
  return {
    id, name, category: 'Poses', group, summary, howTo, params: FIG_PARAMS,
    draw: (g, p) => drawSideFigure(g, pose, p.heads, flags(p)),
  }
}

function cycle(
  id: string, name: string, frames: number, loop: boolean, preview: number, pose: (ph: number) => Pose,
  summary: string, howTo: string, labels = false,
): TemplateDef {
  return {
    id, name, category: 'Motion Cycles', group: 'Body motion', summary, howTo, params: FIG_PARAMS,
    motion: { frames, loop, preview },
    draw: (g, p, ph) => {
      drawSideFigure(g, pose(ph), p.heads, flags(p))
      if (labels && loop) {
        const n = keyPoseName(ph, 0.5 / frames + 0.001)
        if (n) g.text(n, 0, 238, 15)
      }
    },
  }
}

const headParams = (yaw: number, pitch: number, roll: number): ParamDef[] => [
  prm('yaw', 'Turn angle', -90, 90, 1, yaw),
  prm('pitch', 'Tilt up / down', -60, 60, 1, pitch),
  prm('roll', 'Head roll', -45, 45, 1, roll),
]
const headDef = (id: string, name: string, yaw: number, pitch: number, roll: number, summary: string): TemplateDef => ({
  id, name, category: 'Human Anatomy', group: 'Head', summary,
  howTo: 'Draw the head over the cranium sphere. Centre line = where the face points; brow, eye, nose and mouth lines wrap the sphere so features stay in perspective at any angle. Slide Turn angle for in-between angles (20° → 45° → 70°).',
  params: headParams(yaw, pitch, roll),
  draw: (g, p) => drawHead(g, { yaw: p.yaw, pitch: p.pitch, roll: p.roll, r: 110 }),
})

function hand(g: G, spread: number): void {
  g.curve([[-45, 60], [-52, 0], [-40, -50], [40, -50], [52, 0], [45, 60]], 'main')
  g.line(-45, 60, 45, 60, 'main')
  const base = [-36, -12, 12, 36]
  base.forEach((bx, i) => {
    const a = (i - 1.5) * 0.16 * spread
    const L = [58, 70, 64, 50][i]
    const s1: Pt = [bx + Math.sin(a) * L, -50 - Math.cos(a) * L]
    const s2: Pt = [bx + Math.sin(a * 1.3) * L * 1.75, -50 - Math.cos(a * 1.3) * L * 1.75]
    g.poly([[bx, -50], s1, s2], false, 'main')
    g.joint(s1[0], s1[1], 3); g.joint(s2[0], s2[1], 3)
  })
  const ta = -0.9 - 0.4 * spread
  const t1: Pt = [-52 + Math.sin(ta) * 42, 10 - Math.cos(ta) * 42]
  g.poly([[-50, 20], t1, [t1[0] + Math.sin(ta - 0.2) * 38, t1[1] - Math.cos(ta - 0.2) * 38]], false, 'main')
  g.circle(0, 5, 8, 'faint')
}

function foot(g: G): void {
  g.curve([[-70, -60], [-72, 20], [-60, 62], [60, 66], [128, 54], [160, 40]], 'main')
  g.line(-70, -60, -20, -70, 'main')
  g.curve([[-60, 62], [-10, 20], [60, 30], [128, 54]], 'faint')
  g.circle(-45, 45, 22, 'faint')
  ;[[128, 54, 4], [145, 46, 3], [158, 40, 3]].forEach(([x, y, r]) => g.joint(x, y, r))
  g.joint(-45, -62, 4)
  g.line(-120, 78, 200, 78, 'axis')
}

function eye(g: G, open: number): void {
  const t = -34 * open
  g.curve([[-70, 6], [-30, t - 4], [20, t - 6], [70, 8]], 'main')
  g.curve([[-70, 6], [-30, 22], [30, 24], [70, 8]], 'main')
  const ir = 28
  g.ellipse(0, 4, ir, Math.min(ir, 6 + 28 * open), 0, 'main')
  g.circle(0, 4, 10 * Math.min(1, open + 0.2), 'faint')
  g.curve([[-76, -14], [-30, t - 22], [30, t - 24], [78, -6]], 'faint')
  g.line(-90, 8, 90, 8, 'axis')
  g.joint(-70, 6, 3); g.joint(70, 8, 3)
}

// ---------------------------------------------------------------------------------------------
const T: TemplateDef[] = []
const add = (...d: TemplateDef[]) => T.push(...d)

// ===== Human anatomy ======================================================================
add(
  headDef('head-front', 'Head — front', 0, 0, 0, 'Straight-on head with brow, eye, nose and mouth lines'),
  headDef('head-side', 'Head — side', 90, 0, 0, 'Profile head for side-view characters'),
  headDef('head-three-quarter', 'Head — ¾ view', 40, -6, 0, 'Three-quarter head; adjust the turn angle for any in-between'),
  headDef('head-tilted', 'Head — tilted', 28, -22, 14, 'Tilted and rolled head for expressive acting'),
  {
    id: 'face', name: 'Face construction', category: 'Human Anatomy', group: 'Face',
    summary: 'Front-view face proportions: thirds, fifths and feature positions',
    howTo: 'Eyes sit on the centre line, one eye-width apart. Brow, nose base and chin split the lower face into thirds. Use the fifths to place ears, eyes and mouth width.',
    params: [prm('width', 'Face width', 0.75, 1.2, 0.01, 1)],
    draw: (g, p) => {
      const w = p.width
      g.ellipse(0, -5, 105 * w, 140, 0, 'main', Math.PI * 1.02, Math.PI * 1.98)
      g.curve([[-103 * w, -8], [-92 * w, 70], [-48 * w, 125], [0, 142], [48 * w, 125], [92 * w, 70], [103 * w, -8]], 'main')
      ;[-95, -15, 55, 142].forEach((y, i) => g.line(-125 * w, y, 125 * w, y, i === 3 ? 'faint' : 'axis'))
      g.line(-125 * w, 20, 125 * w, 20, 'faint')
      g.line(0, -145, 0, 150, 'axis')
      for (let i = -2; i <= 2; i++) g.line(i * 42 * w, -60, i * 42 * w, 120, 'faint')
      for (const s of [-1, 1]) {
        g.curve([[s * 62 * w, 22], [s * 42 * w, 8], [s * 22 * w, 22], [s * 42 * w, 30]], 'main', true)
        g.ellipse(s * 112 * w, 20, 12 * w, 34, 0, 'faint')
      }
      g.poly([[-18 * w, 62], [0, 70], [18 * w, 62]], false, 'main')
      g.curve([[-36 * w, 96], [0, 104], [36 * w, 96]], 'main')
    },
  },
  {
    id: 'eye', name: 'Eye construction', category: 'Human Anatomy', group: 'Face',
    summary: 'Eye with lids, iris, tear duct and crease', howTo: 'Block the almond first, then place the iris so the upper lid covers its top. Animate blinks by lowering the Open slider.',
    params: [prm('open', 'Eye open', 0.05, 1, 0.01, 1)], draw: (g, p) => eye(g, p.open),
  },
  {
    id: 'nose', name: 'Nose construction', category: 'Human Anatomy', group: 'Face',
    summary: 'Front-view nose planes', howTo: 'Bridge, ball, and wings of the nose as simple forms. Keep the base line on the nose-base guide of the face template.',
    params: [prm('width', 'Width', 0.7, 1.4, 0.01, 1)],
    draw: (g, p) => {
      const w = p.width
      g.poly([[-18 * w, -100], [-26 * w, 20], [-34 * w, 52]], false, 'main')
      g.poly([[18 * w, -100], [26 * w, 20], [34 * w, 52]], false, 'main')
      g.circle(0, 38, 24 * w, 'main')
      g.circle(-30 * w, 52, 14 * w, 'main'); g.circle(30 * w, 52, 14 * w, 'main')
      g.curve([[-36 * w, 64], [-14 * w, 74], [14 * w, 74], [36 * w, 64]], 'faint')
      g.line(0, -110, 0, 90, 'axis')
    },
  },
  {
    id: 'mouth', name: 'Mouth construction', category: 'Human Anatomy', group: 'Face',
    summary: 'Lips with a smile control', howTo: 'Mouth width runs from pupil to pupil. Push the corners up or down to read as a smile or frown.',
    params: [prm('smile', 'Smile', -1, 1, 0.05, 0.3), prm('open', 'Mouth open', 0, 1, 0.05, 0)],
    draw: (g, p) => {
      const c = -p.smile * 22
      const o = p.open * 44
      g.curve([[-70, c], [-30, -10 - p.smile * 6], [0, -4], [30, -10 - p.smile * 6], [70, c]], 'main')
      g.curve([[-70, c], [-30, 8 + o + p.smile * 6], [0, 14 + o], [30, 8 + o + p.smile * 6], [70, c]], 'main')
      if (o > 2) g.curve([[-60, c + 2], [0, 4], [60, c + 2]], 'faint')
      g.line(-80, c, 80, c, 'axis'); g.line(0, -40, 0, 60 + o, 'axis')
    },
  },
  {
    id: 'ear', name: 'Ear construction', category: 'Human Anatomy', group: 'Face', summary: 'Side-view ear', howTo: 'The ear sits between the brow line and nose line. Block the outer curve first, then the inner fold.',
    params: [prm('size', 'Size', 0.7, 1.3, 0.01, 1)],
    draw: (g, p) => {
      const s = p.size
      g.curve([[-30 * s, -70 * s], [20 * s, -92 * s], [52 * s, -40 * s], [40 * s, 40 * s], [10 * s, 92 * s], [-26 * s, 70 * s]], 'main')
      g.curve([[-8 * s, -52 * s], [26 * s, -48 * s], [28 * s, 10 * s], [8 * s, 34 * s], [-4 * s, 18 * s]], 'faint')
      g.circle(-6 * s, 16 * s, 14 * s, 'faint')
      g.line(-40 * s, -70 * s, 60 * s, -70 * s, 'axis'); g.line(-40 * s, 70 * s, 60 * s, 70 * s, 'axis')
    },
  },
  {
    id: 'hair', name: 'Hair construction', category: 'Human Anatomy', group: 'Face', summary: 'Hair mass and flow lines over the skull',
    howTo: 'Treat hair as one big shape first, then split it into 3–4 clumps that follow the flow lines.',
    params: [prm('flow', 'Flow', -1, 1, 0.05, 0.5), prm('volume', 'Volume', 0.8, 1.5, 0.01, 1.1)],
    draw: (g, p) => {
      g.circle(0, 0, 100)
      const v = p.volume
      g.curve([[-110 * v, 20], [-120 * v, -80], [-40 * v, -150 * v], [60 * v, -148 * v], [124 * v, -70], [112 * v, 30]], 'main')
      g.line(0, -106, 0, 110, 'axis')
      for (let i = -2; i <= 2; i++) {
        const x = i * 38
        g.curve([[x * 0.6, -100], [x + p.flow * 40, -30], [x + p.flow * 80, 40], [x + p.flow * 90, 120]], 'faint')
      }
      g.curve([[-98, -30], [-40, -60], [30, -66], [98, -24]], 'axis')
    },
  },
  {
    id: 'torso', name: 'Torso', category: 'Human Anatomy', group: 'Body', summary: 'Rib cage, pelvis and spine masses',
    howTo: 'Draw the rib cage and pelvis as two tilted forms joined by the spine. The angle between them is what makes a pose feel natural.',
    params: [prm('twist', 'Rib / pelvis twist', -30, 30, 1, 10), prm('arch', 'Spine curve', -1, 1, 0.05, 0.3)],
    draw: (g, p) => {
      const tw = (p.twist * Math.PI) / 180
      g.ellipse(0, -60, 96, 80, -tw * 0.6, 'main')
      g.ellipse(0, 90, 70, 46, tw * 0.8, 'main')
      g.curve([[0, -140], [p.arch * 36, -30], [p.arch * 24, 50], [0, 90]], 'axis')
      g.line(-96, -100, 96, -100 + tw * 90, 'faint'); g.line(-70, 90, 70, 90 - tw * 70, 'faint')
      g.circle(0, -150, 16, 'faint')
      ;[[-96, -100], [96, -100 + tw * 90]].forEach(([x, y]) => g.joint(x, y, 4))
    },
  },
  {
    id: 'arm', name: 'Arm', category: 'Human Anatomy', group: 'Body', summary: 'Shoulder, elbow and wrist with masses',
    howTo: 'Upper arm and forearm are two tapered forms; bend at the elbow to pose, keeping segment lengths constant.',
    params: [prm('bend', 'Elbow bend', 0, 150, 1, 40)],
    draw: (g, p) => {
      const a = (p.bend * Math.PI) / 180
      const sh: Pt = [0, -120]
      const el: Pt = [0, 40]
      const wr: Pt = [Math.sin(a) * 150, 40 + Math.cos(a) * 150]
      g.circle(sh[0], sh[1], 34, 'faint')
      g.ellipse(0, -40, 80, 32, Math.PI / 2, 'main'); g.ellipse((el[0] + wr[0]) / 2, (el[1] + wr[1]) / 2, 74, 22, Math.atan2(wr[1] - el[1], wr[0] - el[0]), 'main')
      g.poly([sh, el, wr], false, 'axis')
      g.circle(wr[0] + Math.sin(a) * 30, wr[1] + Math.cos(a) * 30, 24, 'main')
      ;[sh, el, wr].forEach((q) => g.joint(q[0], q[1], 4))
    },
  },
  {
    id: 'leg', name: 'Leg', category: 'Human Anatomy', group: 'Body', summary: 'Hip, knee and ankle with masses',
    howTo: 'Thigh and shin keep their length; the knee bends only one way. Check the foot lands under the weight line.',
    params: [prm('bend', 'Knee bend', 0, 140, 1, 30)],
    draw: (g, p) => {
      const a = (p.bend * Math.PI) / 180
      const hip: Pt = [0, -150], knee: Pt = [0, 20]
      const ank: Pt = [-Math.sin(a) * 160, 20 + Math.cos(a) * 160]
      g.circle(hip[0], hip[1], 40, 'faint')
      g.ellipse(0, -65, 88, 38, Math.PI / 2, 'main'); g.ellipse((knee[0] + ank[0]) / 2, (knee[1] + ank[1]) / 2, 80, 28, Math.atan2(ank[1] - knee[1], ank[0] - knee[0]), 'main')
      g.poly([hip, knee, ank], false, 'axis')
      g.poly([ank, [ank[0] + 100, ank[1] + 10]], false, 'main')
      ;[hip, knee, ank].forEach((q) => g.joint(q[0], q[1], 4))
    },
  },
  {
    id: 'hand', name: 'Hand', category: 'Human Anatomy', group: 'Body', summary: 'Palm block with finger segments',
    howTo: 'Start with the palm as a rounded block, then add each finger as three segments. Use Spread to open or close the hand.',
    params: [prm('spread', 'Finger spread', 0, 1.5, 0.05, 0.6)], draw: (g, p) => hand(g, p.spread),
  },
  { id: 'foot', name: 'Foot', category: 'Human Anatomy', group: 'Body', summary: 'Side-view foot with arch and toes', howTo: 'Heel, arch and ball of the foot are the three contact points. Keep the ground line under the heel and ball.', params: [], draw: (g) => foot(g) },
  {
    id: 'proportions', name: 'Full-body proportions', category: 'Human Anatomy', group: 'Body',
    summary: 'Front mannequin with a head-unit ruler',
    howTo: 'Each ruler tick is one head height. Change the head count to design stylised (5–6) or realistic (7.5–8) characters.',
    params: [...FIG_PARAMS, prm('yaw', 'Turn', -90, 90, 1, 0)],
    draw: (g, p) => {
      drawFrontFigure(g, p.heads, p.yaw, flags(p))
      const H = 400 / p.heads
      for (let i = 0; i <= Math.floor(p.heads); i++) {
        const y = -200 + i * H
        g.line(-190, y, -165, y, 'main')
        if (i > 0) g.text(String(i), -205, y - 3 + 5, 12)
      }
    },
  },
)

// ===== Poses ================================================================================
add(
  sidePose('pose-standing', 'Standing', 'Everyday', STAND, 'Relaxed standing mannequin, side view', 'Use as the neutral start/end of cycles. Move the line of action to push attitude.'),
  sidePose('pose-walking', 'Walking', 'Locomotion', walkPose(0), 'Walk contact pose', 'The contact pose is the first key of a walk: both feet on the ground, arms opposite to legs.'),
  sidePose('pose-running', 'Running', 'Locomotion', runPose(0.3), 'Mid-stride run pose with lean', 'Running leans forward from the ankles, with both feet off the ground at the peak of the stride.'),
  sidePose('pose-jumping', 'Jumping', 'Locomotion', JUMP_APEX, 'Tucked jump at the apex', 'At the apex the body is weightless: tuck the legs and throw the arms up.'),
  sidePose('pose-sitting', 'Sitting', 'Everyday', SIT_POSE, 'Seated pose', 'Thighs run level with the seat. Add a chair from Objects and sit the pelvis on it.'),
  sidePose('pose-kneeling', 'Kneeling', 'Everyday', KNEEL_POSE, 'One-knee kneel', 'Weight drops to the back knee while the front foot stays planted.'),
  sidePose('pose-falling', 'Falling', 'Action', fallPose(0.55), 'Mid-fall with tilted body', 'The whole mannequin rotates about the pelvis. Exaggerate the tilt for impact.'),
  sidePose('pose-fighting', 'Fighting stance', 'Action', FIGHT_POSE, 'Guarded fighting stance', 'Wide base, knees soft, hands up. Start every strike from this stance.'),
  sidePose('pose-reaching', 'Reaching', 'Action', REACH_POSE, 'Reaching up and forward', 'Stretch the whole body along one line; the line of action follows the arm.'),
  {
    id: 'pose-turning', name: 'Turning', category: 'Poses', group: 'Everyday', summary: 'Front-to-side turning mannequin',
    howTo: 'Set the Turn angle between 0° (facing you) and 90° (profile). Shoulders narrow as the body turns.',
    params: [...FIG_PARAMS.slice(0, 1), ...FIG_PARAMS.slice(1), prm('yaw', 'Turn', -90, 90, 1, 40)],
    draw: (g, p) => drawFrontFigure(g, p.heads, p.yaw, flags(p)),
  },
)

// ===== Motion cycles =========================================================================
add(
  cycle('cycle-walk', 'Walk cycle', 8, true, 0, walkPose, 'Looping walk with named key poses', 'Draw Contact → Down → Passing → Up for each leg. Place at frame 1 and every frame gets the matching guide.', true),
  cycle('cycle-run', 'Run cycle', 8, true, 0.3, runPose, 'Looping run with flight phase', 'Run cycles have two flight phases. Keep the head level and let the pelvis rise and fall.'),
  cycle('cycle-jump', 'Jump cycle', 12, false, 0.4, jumpPose, 'Crouch, launch, apex, fall, land', 'Anticipation (crouch) sells the jump; space frames closer at the apex and wider at launch and landing.'),
  cycle('cycle-idle', 'Idle cycle', 24, true, 0.25, (p) => idlePose(p, 1), 'Breathing idle with subtle sway', 'Keep it small: a chest rise and a slight head drift stop a held pose from feeling dead.'),
  {
    id: 'cycle-turnaround', name: 'Turnaround', category: 'Motion Cycles', group: 'Body motion', summary: '360° character turnaround',
    howTo: 'Front, ¾, side, ¾ back, back. Use it as a model sheet so every drawing keeps the same proportions.',
    params: FIG_PARAMS, motion: { frames: 8, loop: true, preview: 0.1 },
    draw: (g, p, ph) => drawFrontFigure(g, p.heads, ph * 360, flags(p)),
  },
  cycle('cycle-fall', 'Falling', 10, false, 0.55, fallPose, 'Off-balance, tumble, impact', 'The body leads with the shoulders, then rotates. Add a squash on impact.'),
  cycle('cycle-land', 'Landing', 8, false, 0.4, landPose, 'Fall, absorb, recover', 'Knees absorb the landing and the torso folds forward before the figure recovers.'),
  cycle('cycle-punch', 'Punch', 8, false, 0.5, (p) => blendKeys(PUNCH_KEYS, p), 'Guard, wind-up, strike, recover', 'Wind-up goes opposite to the punch. The hit lasts one or two frames; the recovery is slower.'),
  cycle('cycle-kick', 'Kick', 10, false, 0.55, (p) => blendKeys(KICK_KEYS, p), 'Chamber and extend kick', 'Lean away from the kick to keep balance. Snap the leg out on the strike frame.'),
  cycle('cycle-throw', 'Throw', 10, false, 0.5, (p) => blendKeys(THROW_KEYS, p), 'Wind-back, release, follow-through', 'Weight shifts from back foot to front. Release is fast; follow-through carries the arm across.'),
  cycle('cycle-wave', 'Wave', 12, true, 0.1, wavePose, 'Friendly looping wave', 'The forearm swings from the elbow while the upper arm stays still.'),
  {
    id: 'cycle-head-turn', name: 'Head turn', category: 'Motion Cycles', group: 'Face motion', summary: 'Head swings from front to ¾ and back',
    howTo: 'Break a head turn into front, slight turn, ¾. Add an overlap: the eyes arrive first, then the head.',
    params: [prm('amount', 'Turn amount', 10, 90, 1, 55), prm('pitch', 'Tilt', -30, 30, 1, -4)], motion: { frames: 12, loop: true, preview: 0.25 },
    draw: (g, p, ph) => drawHead(g, { yaw: Math.sin(ph * Math.PI * 2) * p.amount, pitch: p.pitch, roll: 0, r: 110 }),
  },
  {
    id: 'cycle-blink', name: 'Eye blink', category: 'Motion Cycles', group: 'Face motion', summary: 'Blink: close fast, open slower',
    howTo: 'A blink is 4–6 frames: lids close in 1–2, stay shut for 1, open in 2–3.',
    params: [], motion: { frames: 6, loop: true, preview: 0 },
    draw: (g, _p, ph) => eye(g, ph < 0.5 ? Math.max(0.05, 1 - ph * 2 * 1.2) : Math.min(1, (ph - 0.5) * 2 * 0.9 + 0.05)),
  },
  {
    id: 'cycle-breathing', name: 'Breathing', category: 'Motion Cycles', group: 'Body motion', summary: 'Chest rise and fall',
    howTo: 'Rib cage lifts and widens on the inhale; shoulders follow a frame later.',
    params: [FIG_PARAMS[0], prm('depth', 'Depth', 0.2, 3, 0.1, 1.4), FIG_PARAMS[1], FIG_PARAMS[3]], motion: { frames: 24, loop: true, preview: 0.25 },
    draw: (g, p, ph) => drawSideFigure(g, idlePose(ph, p.depth), p.heads, { masses: !!p.masses, action: false, ground: !!p.ground }),
  },
)

// ===== Animals (side view) ===================================================================
function quadruped(g: G, o: { chest: number; hip: number; body: number; neck: Pt; head: number; snout: number; leg: number; tail: Pt[]; ears: number; hock: number }): void {
  const cx = -o.body / 2, hx = o.body / 2
  g.circle(cx, 0, o.chest); g.circle(hx, 4, o.hip)
  g.line(cx, -o.chest, hx, -o.hip + 4, 'main'); g.line(cx, o.chest, hx, o.hip + 4, 'main')
  g.curve([[cx, 0], [(cx + hx) / 2, -6], [hx, 4]], 'axis')
  const hd: Pt = [cx + o.neck[0], o.neck[1]]
  g.line(cx - o.chest * 0.4, -o.chest * 0.8, hd[0] + o.head * 0.4, hd[1] - o.head * 0.6, 'main')
  g.line(cx - o.chest * 0.2, o.chest * 0.6, hd[0] + o.head * 0.4, hd[1] + o.head * 0.7, 'main')
  g.circle(hd[0], hd[1], o.head)
  g.ellipse(hd[0] - o.snout / 2 - o.head * 0.4, hd[1] + o.head * 0.25, o.snout / 2, o.head * 0.5, 0.15, 'main')
  g.poly([[hd[0] + o.head * 0.3, hd[1] - o.head * 0.8], [hd[0] + o.head * 0.9, hd[1] - o.head * (0.8 + o.ears)], [hd[0] + o.head * 1.1, hd[1] - o.head * 0.4]], false, 'main')
  g.joint(hd[0] - o.head * 0.3, hd[1] - o.head * 0.1, 3)
  const ground = o.chest + o.leg
  const legs: [number, number, number][] = [[cx - 8, o.chest * 0.6, 0], [cx + 14, o.chest * 0.6, 1], [hx - 4, o.hip * 0.6, 2], [hx + 14, o.hip * 0.6, 3]]
  for (const [x, y, k] of legs) {
    const far = k % 2 === 1
    const rear = k >= 2
    const knee: Pt = [x + (rear ? o.hock : 6), y + o.leg * 0.5]
    const pas: Pt = [x + (rear ? -o.hock * 0.4 : 0), ground - 6]
    g.poly([[x, y], knee, pas, [pas[0] - 14, ground]], false, far ? 'faint' : 'main')
    g.joint(knee[0], knee[1], far ? 2.5 : 3.5)
  }
  g.curve(o.tail.map((q): Pt => [hx + q[0], q[1]]), 'main')
  g.line(-o.body, ground, o.body, ground, 'axis')
}

add(
  { id: 'animal-dog', name: 'Dog', category: 'Animals', group: 'Four-legged', summary: 'Side-view dog construction', howTo: 'Two big masses (chest, hips) joined by the spine; head as a ball with a muzzle. Legs bend like a human\'s but with the heel raised.', params: [prm('length', 'Body length', 0.8, 1.3, 0.01, 1)], draw: (g, p) => quadruped(g, { chest: 62, hip: 52, body: 190 * p.length, neck: [-92, -62], head: 36, snout: 46, leg: 100, tail: [[40, -10], [80, -50], [96, -92]], ears: 0.8, hock: -22 }) },
  { id: 'animal-cat', name: 'Cat', category: 'Animals', group: 'Four-legged', summary: 'Side-view cat construction', howTo: 'Lighter, more flexible spine than a dog. The tail is a long curve that follows the line of action.', params: [prm('length', 'Body length', 0.8, 1.3, 0.01, 1)], draw: (g, p) => quadruped(g, { chest: 46, hip: 42, body: 170 * p.length, neck: [-78, -34], head: 32, snout: 22, leg: 80, tail: [[30, -20], [90, 0], [130, -70], [100, -130]], ears: 0.9, hock: -26 }) },
  { id: 'animal-horse', name: 'Horse', category: 'Animals', group: 'Four-legged', summary: 'Side-view horse construction', howTo: 'Long neck, deep chest, tall legs. Keep the hind leg angles like a Z shape (stifle, hock, fetlock).', params: [prm('length', 'Body length', 0.8, 1.3, 0.01, 1)], draw: (g, p) => quadruped(g, { chest: 86, hip: 78, body: 260 * p.length, neck: [-120, -130], head: 38, snout: 90, leg: 150, tail: [[60, -30], [110, 30], [120, 110]], ears: 0.7, hock: -34 }) },
  {
    id: 'animal-bird', name: 'Bird', category: 'Animals', group: 'Flying', summary: 'Side-view perched bird with wing', howTo: 'Egg-shaped body, small round head, wing as a long teardrop folded along the back.',
    params: [prm('wing', 'Wing raise', 0, 1, 0.05, 0.2)],
    draw: (g, p) => {
      g.ellipse(0, 0, 90, 58, -0.25, 'main'); g.circle(-92, -58, 30)
      g.poly([[-122, -58], [-158, -50], [-124, -44]], true, 'main')
      g.joint(-100, -64, 3)
      const w = p.wing
      g.curve([[-30, -20], [20 - w * 10, -60 - w * 120], [110, -30 - w * 150], [150, 20 - w * 70]], 'main')
      g.curve([[-30, -20], [40, 10], [150, 20 - w * 70]], 'faint')
      g.curve([[80, 20], [150, 30], [200, 44]], 'main')
      g.poly([[-10, 50], [-14, 100], [-34, 110]], false, 'main'); g.poly([[14, 52], [18, 100], [38, 110]], false, 'faint')
      g.line(-80, 112, 80, 112, 'axis')
      g.line(-92, -58, 40, 0, 'axis')
    },
  },
)

// ===== Objects ===============================================================================
const wheel = (g: G, x: number, y: number, r: number) => { g.circle(x, y, r); g.circle(x, y, r * 0.55, 'faint'); g.joint(x, y, 3) }
add(
  {
    id: 'obj-car', name: 'Car', category: 'Objects', group: 'Vehicles', summary: 'Side-view car', howTo: 'Block the body as a long box, add the cabin as a smaller trapezoid, then wheels on the ground line.',
    params: [prm('length', 'Length', 0.8, 1.3, 0.01, 1)],
    draw: (g, p) => {
      const L = 190 * p.length
      g.curve([[-L, 20], [-L, -20], [-L * 0.55, -34], [-L * 0.3, -36], [L * 0.35, -36], [L, -10], [L, 20]], 'main')
      g.poly([[-L * 0.6, -34], [-L * 0.38, -92], [L * 0.2, -92], [L * 0.5, -36]], false, 'main')
      g.line(-L * 0.05, -90, -L * 0.05, -36, 'faint'); g.line(-L, 20, L, 20, 'main')
      wheel(g, -L * 0.6, 24, 38); wheel(g, L * 0.6, 24, 38); g.line(-L - 20, 62, L + 20, 62, 'axis')
    },
  },
  {
    id: 'obj-motorcycle', name: 'Motorcycle', category: 'Objects', group: 'Vehicles', summary: 'Side-view motorcycle', howTo: 'Two wheels, a diamond frame between them, tank and seat on top.',
    params: [],
    draw: (g) => {
      wheel(g, -130, 40, 50); wheel(g, 130, 40, 50)
      g.poly([[-130, 40], [-40, -20], [50, -20], [130, 40]], false, 'main'); g.poly([[-40, -20], [-10, 40], [-130, 40]], false, 'faint')
      g.ellipse(20, -46, 52, 22, -0.1, 'main'); g.poly([[-90, -36], [-30, -40], [-40, -20]], false, 'main')
      g.poly([[110, 0], [100, -70], [78, -86]], false, 'main'); g.line(-190, 90, 190, 90, 'axis')
    },
  },
  {
    id: 'obj-bicycle', name: 'Bicycle', category: 'Objects', group: 'Vehicles', summary: 'Side-view bicycle', howTo: 'Two equal wheels, diamond frame, fork and handlebar. Keep the wheels perfectly round.',
    params: [],
    draw: (g) => {
      wheel(g, -110, 30, 62); wheel(g, 110, 30, 62)
      g.poly([[-110, 30], [-30, -40], [50, -40], [110, 30]], false, 'main'); g.poly([[-30, -40], [-10, 30], [-110, 30]], false, 'main'); g.line(-10, 30, 50, -40, 'main')
      g.line(-40, -58, -14, -58, 'main'); g.line(-30, -40, -30, -58, 'faint'); g.line(50, -40, 68, -78, 'main'); g.line(58, -78, 82, -78, 'main')
      g.circle(-10, 30, 14, 'faint'); g.line(-190, 92, 190, 92, 'axis')
    },
  },
  {
    id: 'obj-house', name: 'House', category: 'Objects', group: 'Buildings', summary: 'Front-facing house', howTo: 'Box, roof triangle, then door and windows on a centre line. Switch to a perspective guide for angled views.',
    params: [prm('floors', 'Floors', 1, 3, 1, 2)],
    draw: (g, p) => {
      const fl = p.floors, h = 90 * fl, top = 80 - h
      g.rect(-140, top, 280, h); g.poly([[-160, top], [0, top - 90], [160, top]], true, 'main')
      g.rect(-24, 20, 48, 60); g.joint(14, 52, 3)
      for (let f = 0; f < fl; f++) for (const x of [-100, 60]) g.rect(x, top + 16 + f * 90, 40, 46, 'main')
      g.line(0, top - 100, 0, 90, 'axis'); g.line(-200, 80, 200, 80, 'axis')
    },
  },
  {
    id: 'obj-building', name: 'Building', category: 'Objects', group: 'Buildings', summary: 'Tall building with window grid', howTo: 'Draw the silhouette first, then a window grid that follows the facade. Vary the heights for a skyline.',
    params: [prm('floors', 'Floors', 4, 20, 1, 10), prm('cols', 'Windows per row', 2, 8, 1, 4)],
    draw: (g, p) => {
      const h = 28 * p.floors, w = 150, top = 120 - h
      g.rect(-w / 2, top, w, h)
      for (let r = 0; r < p.floors; r++) for (let c = 0; c < p.cols; c++) {
        const cw = (w - 20) / p.cols
        g.rect(-w / 2 + 10 + c * cw + 4, top + 6 + r * 28, cw - 8, 16, 'faint')
      }
      g.line(-w / 2 - 10, 120, w / 2 + 10, 120, 'axis')
    },
  },
  {
    id: 'obj-chair', name: 'Chair', category: 'Objects', group: 'Furniture', summary: 'Side-view chair', howTo: 'Seat plane, back plane and four legs. Match the seat height to the sitting pose.',
    params: [prm('height', 'Seat height', 0.7, 1.4, 0.01, 1)],
    draw: (g, p) => {
      const s = 50 * p.height
      g.poly([[-50, 80 - s], [60, 80 - s]], false, 'main'); g.poly([[-50, 80 - s], [-56, -70], [-40, -76]], false, 'main')
      g.line(-48, 80 - s, -48, 80, 'main'); g.line(56, 80 - s, 56, 80, 'main'); g.line(-30, 80 - s, -30, 80, 'faint'); g.line(36, 80 - s, 36, 80, 'faint')
      g.line(-100, 80, 110, 80, 'axis')
    },
  },
  {
    id: 'obj-phone', name: 'Phone', category: 'Objects', group: 'Devices', summary: 'Smartphone, front view', howTo: 'Rounded rectangle with a screen inset. Keep a 2:1 ratio for modern phones.', params: [prm('tilt', 'Tilt', -30, 30, 1, 0)],
    draw: (g, p) => {
      g.ctx.save(); g.ctx.rotate((p.tilt * Math.PI) / 180)
      g.rect(-50, -100, 100, 200); g.rect(-43, -82, 86, 160, 'faint'); g.circle(0, 90, 6, 'faint'); g.line(-12, -92, 12, -92, 'faint')
      g.ctx.restore()
    },
  },
  {
    id: 'obj-computer', name: 'Computer', category: 'Objects', group: 'Devices', summary: 'Monitor, stand and keyboard', howTo: 'Screen and keyboard are two planes at different angles; the stand joins them.', params: [],
    draw: (g) => {
      g.rect(-120, -110, 240, 150); g.rect(-108, -98, 216, 126, 'faint'); g.poly([[-20, 40], [-30, 76], [30, 76], [20, 40]], true, 'main')
      g.poly([[-90, 100], [-110, 120], [110, 120], [90, 100]], true, 'main'); g.line(-90, 100, 90, 100, 'main'); g.line(-190, 124, 190, 124, 'axis')
    },
  },
  {
    id: 'obj-tree', name: 'Tree', category: 'Objects', group: 'Nature', summary: 'Tree with trunk and canopy masses', howTo: 'Trunk, three or four branch lines, then big canopy circles. Add detail only at the edges.', params: [prm('canopy', 'Canopy size', 0.7, 1.4, 0.01, 1)],
    draw: (g, p) => {
      const c = p.canopy
      g.curve([[-16, 120], [-10, 40], [-22, -20]], 'main'); g.curve([[16, 120], [12, 40], [22, -20]], 'main')
      g.line(-16, 120, 16, 120, 'main'); g.poly([[0, 40], [-50, -20]], false, 'faint'); g.poly([[0, 40], [56, -30]], false, 'faint')
      g.circle(0, -70 * c, 80 * c); g.circle(-70 * c, -20 * c, 56 * c, 'main'); g.circle(70 * c, -26 * c, 60 * c, 'main'); g.line(-140, 124, 140, 124, 'axis')
    },
  },
  {
    id: 'obj-rock', name: 'Rock', category: 'Objects', group: 'Nature', summary: 'Rock with light planes', howTo: 'Block a chunky polygon, then split into a top, front and side plane to place the light.', params: [],
    draw: (g) => {
      g.poly([[-110, 60], [-130, -10], [-70, -70], [10, -90], [100, -50], [130, 20], [100, 62]], true, 'main')
      g.poly([[-70, -70], [-20, -20], [100, -50]], false, 'faint'); g.poly([[-20, -20], [-30, 62]], false, 'faint'); g.poly([[-20, -20], [130, 20]], false, 'faint')
      g.line(-170, 64, 170, 64, 'axis')
    },
  },
  {
    id: 'obj-bag', name: 'Bag', category: 'Objects', group: 'Everyday', summary: 'Backpack / handbag', howTo: 'Soft box with a rounded top, strap loop and a front pocket.', params: [],
    draw: (g) => {
      g.curve([[-80, 90], [-90, -10], [-60, -80], [60, -80], [90, -10], [80, 90]], 'main'); g.line(-80, 90, 80, 90, 'main')
      g.rect(-52, 20, 104, 56, 'main'); g.curve([[-40, -80], [-30, -126], [30, -126], [40, -80]], 'main'); g.line(-60, -30, 60, -30, 'faint')
      g.line(-130, 94, 130, 94, 'axis')
    },
  },
)

export const TEMPLATES: TemplateDef[] = T
const byId = new Map(T.map((t) => [t.id, t]))
export const getTemplate = (id: string): TemplateDef | undefined => byId.get(id)

export const defaultParams = (t: TemplateDef): Record<string, number> => Object.fromEntries(t.params.map((p) => [p.id, p.value]))

/** Phase 0..1 of a motion template at timeline frame `frame` (index). */
export function phaseAt(def: TemplateDef, cycleInfo: { frames: number; start: number } | undefined, frame: number): number {
  if (!def.motion) return 0
  if (!cycleInfo) return def.motion.preview
  const n = Math.max(1, cycleInfo.frames)
  const f = frame - cycleInfo.start
  if (def.motion.loop) return (((f % n) + n) % n) / n
  return Math.max(0, Math.min(1, n <= 1 ? 0 : f / (n - 1)))
}
