// Pixel art for the Ruthless Claude pane. Pure functions: no engine calls.
// Each terminal cell shows two square pixels stacked ('▀': fg = top, bg = bottom).

export type Mode = 'idle' | 'typing' | 'squeeze' | 'press' | 'revenge' | 'breakout'

export const W = 40 // pixels wide (= columns), small enough for a narrow pane
export const H = 28 // pixels tall (= 14 rows)
const FLOOR = 25 // last row feet stand on
const NONE = -1
const DEFAULT = 0x01000000

type Buf = Int32Array
const newBuf = (): Buf => new Int32Array(W * H).fill(NONE)
let OX = 0 // shifts a whole scene sideways while it draws
function px(b: Buf, x: number, y: number, c: number) {
  x = Math.round(x + OX); y = Math.round(y)
  if (x >= 0 && x < W && y >= 0 && y < H) b[y * W + x] = c
}
function rect(b: Buf, x: number, y: number, w: number, h: number, c: number) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(b, x + i, y + j, c)
}

// ============ palettes ============
type Palette = { L: number; B: number; D: number; arm: number; eye: number; brow?: number; glow?: number }
const CLAUDE: Palette = { L: 0xeea58a, B: 0xd97757, D: 0xae5236, arm: 0xc4613f, eye: 0x2b1a14 }
// charcoal grey, glowing white eyes, a dark mouth with two fangs, two little horns
// same as Claude, but black with white eyes (a faint grey edge keeps him visible on dark terminals)
const RUTHLESS: Palette = { L: 0x3a3a3a, B: 0x111111, D: 0x080808, arm: 0x1c1c1c, eye: 0xffffff }
const SHADOW = 0x2e2e2e
const WOOD = 0x5a4636, WOOD_L = 0x7a604a, WOOD_D = 0x40312a
const JUICE = 0xffa53a, JUICE_L = 0xffcf7a
const GLASS = 0xa7b8c8
const GOLD = 0xffd54a, GOLD_D = 0xc99a1e, GLOW = 0xfff3b0

// ============ the character, drawn from its proportions ============
type Eyes = 'open' | 'blink' | 'squint' | 'bulge' | 'angry' | 'menace' | 'mad'
type Char = {
  x: number // left edge of the body
  y: number // top of the body
  w: number
  h: number
  pal: Palette
  eyes: Eyes
  look?: number // eye shift, - left / + right
  brow?: number // Ruthless: 1 angry, 2 angrier
  arms?: boolean // the little side arms
  legs?: boolean
  bulge?: number // head swells while squeezed (extra px on each side)
  horns?: boolean // Ruthless's two little horns
  mouth?: number // Ruthless: 1 fangs, 2 open snarl
}

function drawChar(b: Buf, c: Char) {
  const { x, y, w, h, pal } = c
  const bulge = c.bulge ?? 0
  const headRows = Math.min(6, h - 3)
  for (let j = 0; j < h; j++) {
    // squeezed: head and bottom bulge, the waist stays thin (an hourglass, not a peg)
    const third = Math.ceil(h / 3)
    const extra = j < third || j >= h - third ? bulge : 0
    const rw = w + extra * 2
    const rx = x - extra
    for (let i = 0; i < rw; i++) {
      const corner = (j === 0 || j === h - 1) && (i === 0 || i === rw - 1)
      if (corner) continue
      let col = pal.B
      if (j === 0) col = pal.L
      else if (j === h - 1 || i === rw - 1) col = pal.D
      else if (i === 0 && j < h / 2) col = pal.L
      px(b, rx + i, y + j, col)
    }
  }
  // side arms: 2x2 nubs sticking out at mid height
  if (c.arms !== false) {
    const ay = y + Math.floor(h * 0.45)
    rect(b, x - 2, ay, 2, 2, pal.arm)
    rect(b, x + w, ay, 2, 2, pal.arm)
  }
  // four little legs
  if (c.legs !== false) {
    for (const lx of [2, 4, w - 5, w - 3]) rect(b, x + lx, y + h, 1, 2, pal.D)
  }
  // two small horns, leaning outward
  if (c.horns) {
    px(b, x + 2, y - 1, pal.B); px(b, x + 1, y - 2, pal.L)
    px(b, x + w - 3, y - 1, pal.B); px(b, x + w - 2, y - 2, pal.L)
  }
  drawEyes(b, c, headRows)
}

function drawEyes(b: Buf, c: Char, headRows: number) {
  const bulge = c.bulge ?? 0
  const hw = c.w + bulge * 2 // the head's width
  const hx = c.x - bulge
  const ew = c.eyes === 'bulge' || c.eyes === 'menace' || c.eyes === 'mad' ? 3 : 2
  let L = hx + Math.round(hw * 0.24)
  let R = hx + hw - Math.round(hw * 0.24) - ew
  if (R - (L + ew) < 3) { // keep the face readable when squeezed thin
    const mid = hx + hw / 2
    L = Math.floor(mid - 1.5 - ew); R = Math.ceil(mid + 1.5)
  }
  const look = c.look ?? 0
  L += look; R += look
  const ey = c.y + Math.max(2, Math.floor(headRows / 2) - 1)
  const e = c.pal.eye
  switch (c.eyes) {
    case 'open':
      rect(b, L, ey, 2, 3, e); rect(b, R, ey, 2, 3, e); break
    case 'blink':
      rect(b, L, ey + 2, 2, 1, e); rect(b, R, ey + 2, 2, 1, e); break
    case 'squint': // > <
      px(b, L, ey, e); px(b, L + 1, ey + 1, e); px(b, L, ey + 2, e)
      px(b, R + 1, ey, e); px(b, R, ey + 1, e); px(b, R + 1, ey + 2, e); break
    case 'bulge': // wide eyes with a shine
      rect(b, L, ey - 1, 3, 3, e); rect(b, R, ey - 1, 3, 3, e)
      px(b, L, ey - 1, 0xffffff); px(b, R, ey - 1, 0xffffff); break
    case 'angry': {
      // inner top corner cut, slanted brow above it
      rect(b, L, ey + 1, 2, 2, e); px(b, L, ey, e)
      rect(b, R, ey + 1, 2, 2, e); px(b, R + 1, ey, e)
      const br = c.pal.brow ?? 0x000000
      const drop = (c.brow ?? 1) >= 2 ? 1 : 0
      px(b, L - 1, ey - 1 + drop, br); px(b, L, ey - 1 + drop, br); px(b, L + 1, ey + drop, br); px(b, L + 2, ey + drop, br)
      px(b, R + 2, ey - 1 + drop, br); px(b, R + 1, ey - 1 + drop, br); px(b, R, ey + drop, br); px(b, R - 1, ey + drop, br)
      break
    }
    case 'mad': {
      // angry white eyes, no brow: the inner top corners are cut so they slant into a V
      // harder (brow 2): the eyes narrow to slits
      const hard = (c.brow ?? 1) >= 2
      px(b, L, ey, e); px(b, R + 2, ey, e)
      rect(b, L, ey + 1, 3, hard ? 1 : 2, e); rect(b, R, ey + 1, 3, hard ? 1 : 2, e)
      break
    }
    case 'menace': {
      // white slits slanting into a V under a dark brow; the brow drops when angrier
      const br = c.pal.brow ?? 0x000000
      const d = (c.brow ?? 1) >= 2 ? 1 : 0
      rect(b, L, ey + 1, 3, 1, e); rect(b, R, ey + 1, 3, 1, e)
      px(b, L, ey, e); px(b, R + 2, ey, e)
      px(b, L - 1, ey - 1 + d, br); px(b, L, ey - 1 + d, br); px(b, L + 1, ey + d, br); px(b, L + 2, ey + d, br)
      px(b, R + 3, ey - 1 + d, br); px(b, R + 2, ey - 1 + d, br); px(b, R + 1, ey + d, br); px(b, R, ey + d, br)
      if (d) { px(b, L, ey + 1, e); px(b, R + 2, ey + 1, e) }
      break
    }
  }
  if (c.mouth) {
    const mid = hx + hw / 2 + look
    const my = ey + 4
    const br = c.pal.brow ?? 0x000000
    if (c.mouth >= 2) { // open snarl
      const mx = Math.round(mid - 4)
      rect(b, mx, my, 8, 2, br)
      px(b, mx + 1, my, 0xffffff); px(b, mx + 6, my, 0xffffff)
    } else { // a hard mouth line with two small fang points under it
      const mx = Math.round(mid - 2)
      rect(b, mx, my, 4, 1, br)
      px(b, mx, my + 1, 0xffffff); px(b, mx + 3, my + 1, 0xffffff)
    }
  }
}

function shadow(b: Buf, x: number, w: number) {
  rect(b, x + 1, FLOOR + 1, Math.max(2, w - 2), 1, SHADOW)
}

// ============ idle ============
// breathing in 3 steps over 1.6 s, the two out of phase; a glance at each other now and then
const BREATH = [0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0, 0]
function breathe(base: Char, phase: number): Char {
  const s = BREATH[phase % BREATH.length]
  if (s === 0) return base
  if (s === 1) return { ...base, y: base.y + 1, h: base.h - 1 }
  return { ...base, x: base.x - 1, w: base.w + 2, y: base.y + 1, h: base.h - 1 }
}
function idleScene(b: Buf, f: number) {
  // every ~4.4 s they look at each other: Claude's eyes go wide, Ruthless frowns harder
  const g = f % 44
  const glance = g >= 34
  const startled = g >= 34 && g < 37
  const rBase: Char = { x: 4, y: FLOOR - 11, w: 13, h: 10, pal: RUTHLESS, eyes: f % 61 < 2 ? 'blink' : 'mad', brow: glance ? 2 : 1, look: glance ? 2 : 0 }
  const cBase: Char = { x: 25, y: FLOOR - 11, w: 13, h: 10, pal: CLAUDE, eyes: startled ? 'bulge' : f % 47 < 2 ? 'blink' : 'open', look: startled ? 0 : glance ? -2 : 0 }
  shadow(b, 2, 16); shadow(b, 25, 13)
  drawChar(b, breathe(rBase, f))
  drawChar(b, breathe(cBase, f + 8))
}

// ============ typing: Claude on a stool at a desk ============
const SCREEN_BG = 0x10141b, FRAME = 0x3b4252, STAND = 0x4c566a, KEYS = 0x9aa5b1, KEYS_D = 0x5c6573
const CODE = [0x7ec699, 0x61afef, 0xe5c07b]
const LINES = [6, 4, 7]
function typingScene(b: Buf, f: number) {
  // a plant on the right balances the desk group, which sits 4 px left of centre
  rect(b, 35, 23, 4, 3, 0x8b5a3c); rect(b, 35, 23, 4, 1, 0xa86f4b)
  px(b, 36, 22, 0x4f9a5a); px(b, 37, 21, 0x6cc070); px(b, 35, 21, 0x4f9a5a); px(b, 38, 20, 0x4f9a5a); px(b, 36, 19, 0x6cc070); px(b, 37, 22, 0x6cc070)
  OX = -4
  try { typingDesk(b, f) } finally { OX = 0 }
}
function typingDesk(b: Buf, f: number) {
  // stool
  rect(b, 11, 21, 10, 1, WOOD_L)
  rect(b, 12, 22, 1, 4, WOOD); rect(b, 19, 22, 1, 4, WOOD)
  // desk
  rect(b, 24, 19, 16, 1, WOOD_L); rect(b, 24, 20, 16, 1, WOOD_D)
  rect(b, 25, 21, 1, 5, WOOD); rect(b, 38, 21, 1, 5, WOOD)
  // monitor on the desk
  rect(b, 29, 8, 11, 9, FRAME)
  rect(b, 30, 9, 9, 7, SCREEN_BG)
  const total = LINES.reduce((a, n) => a + n, 0)
  let typed = Math.floor(f / 2) % (total + 6)
  let cx = 31, cy = 10
  for (let k = 0; k < LINES.length && typed > 0; k++) {
    const n = Math.min(LINES[k], typed)
    rect(b, 31 + (k === 1 ? 1 : 0), 10 + k * 2, n, 1, CODE[k])
    cx = 31 + (k === 1 ? 1 : 0) + n; cy = 10 + k * 2
    typed -= n
  }
  if (Math.floor(f / 4) % 2 === 0 && cx < 39) px(b, cx, cy, 0xffffff)
  rect(b, 33, 17, 2, 1, STAND); rect(b, 31, 18, 6, 1, STAND)
  // keyboard on the desk
  rect(b, 25, 18, 6, 1, KEYS_D)
  for (let i = 0; i < 6; i += 2) px(b, 25 + i, 18, KEYS)

  // Claude sits on the stool, turned toward the screen, bobbing slightly
  const bob = Math.floor(f / 6) % 2
  const c: Char = { x: 10, y: 11 + bob, w: 14, h: 10, pal: CLAUDE, eyes: f % 41 < 2 ? 'blink' : 'open', look: 2, arms: false, legs: false }
  drawChar(b, c)
  // legs hanging over the front of the stool
  rect(b, 13, 21 + bob, 1, 2, CLAUDE.D); rect(b, 18, 21 + bob, 1, 2, CLAUDE.D)
  // two separate hands taking turns on the keys (5 taps a second), each on its own forearm
  const step = Math.floor(f / 2) % 2
  const h1 = step === 0 ? 14 : 16, h2 = step === 0 ? 16 : 14
  rect(b, 24, h1 + 1, 1, 1, CLAUDE.D); rect(b, 25, h1, 2, 2, CLAUDE.arm)
  rect(b, 24, h2 + 1, 4, 1, CLAUDE.D); rect(b, 28, h2, 2, 2, CLAUDE.arm)
  // a key lights up under the hand that just landed
  px(b, step === 0 ? 28 : 25, 18, 0xffffff)
}

// ============ squeeze ============
// intro (8 frames): Ruthless steps in and grabs Claude, then squeeze cycles of 12 frames:
// fast squeeze, hold with shake, overshoot rebound, short beat. Juice drips from under his
// fists (into a cup on the far side) and sprays from his head; every 2nd squeeze a gold gem
// (the best result) pops out and flies off the top.
const CYCLE = [0, 3, 6, 6, 7, 6, -2, -1, 0, 0, 0, 0]
const CYCLE_LEN = CYCLE.length
const GEM = ['.GGG.', 'GWGGG', '.GGD.', '..D..']
const GRIP_Y = 16 // the arms grip at this height, level with Ruthless's body
function squeezeScene(b: Buf, f: number) {
  const t = Math.max(0, f - 8)
  const p = t % CYCLE_LEN
  const s = f < 8 ? 0 : CYCLE[p]
  const n = Math.floor(t / CYCLE_LEN) // which squeeze this is
  const hard = s >= 3

  const rx = -2 + Math.min(4, Math.floor(f / 2)) // walks in to x=2
  const lift = f < 4 ? 0 : Math.min(2, f - 4) // lifts Claude 2 px off the ground
  const shake = s >= 6 && f % 2 === 0 ? 1 : 0

  // Claude keeps his volume: thinner means taller (head kept below row 3), rebound makes him wide and short
  const cxMid = 25
  // squeezed into an hourglass: the waist pinches (never under 9 px), head and bottom swell
  const pinch = Math.min(4, Math.max(s, -2))
  const cw = 13 - pinch
  const bottom = FLOOR - 2 - lift // body's last row; legs hang below it
  const ch = Math.min(13, 10 + Math.round(Math.max(0, s) * 0.45) - (s < 0 ? 1 : 0))
  const cx = Math.round(cxMid - cw / 2) + shake
  const cy = bottom - ch + 1

  shadow(b, rx, 16)
  shadow(b, cxMid - 5, 10)

  // the cup on the far side: +1 level per squeeze, overflows, then a fresh cup
  const cupX = 33
  rect(b, cupX, 21, 1, 5, GLASS); rect(b, cupX + 4, 21, 1, 5, GLASS); rect(b, cupX, 25, 5, 1, GLASS)
  const dripping = f >= 8 && p >= 1 && p <= 8
  const filled = n % 6
  let level = Math.min(4, filled)
  if (dripping && p % 3 === 0) level = Math.min(4, level + 1) // the surface wobbles as drops land
  if (level > 0) {
    rect(b, cupX + 1, 25 - level, 3, level, JUICE)
    rect(b, cupX + 1, 25 - level, 3, 1, JUICE_L)
  }
  if (filled >= 4 && dripping) { // overflowing down the outside
    px(b, cupX - 1, 22 + (p % 3), JUICE); px(b, cupX + 5, 22 + ((p + 1) % 3), JUICE)
  }

  // Ruthless strains: he squashes down and spreads toward Claude while squeezing
  const r: Char = hard
    ? { x: rx + 1, y: FLOOR - 10, w: 15, h: 9, pal: RUTHLESS, eyes: 'mad', brow: 2, look: 2, arms: false }
    : { x: rx + 1, y: FLOOR - 11, w: 13, h: 10, pal: RUTHLESS, eyes: 'mad', brow: 1, look: 2, arms: false }
  const rEdge = r.x + r.w

  // far arm, behind Claude: shows only as the fist on his far side
  if (f >= 4) rect(b, rEdge, GRIP_Y - 1, cx + cw + 3 - rEdge, 3, RUTHLESS.D)

  drawChar(b, {
    x: cx, y: cy, w: cw, h: ch, pal: CLAUDE,
    eyes: s >= 5 ? 'bulge' : s >= 3 ? 'squint' : 'open',
    bulge: s >= 5 ? 2 : s >= 2 ? 1 : 0,
    arms: false,
  })
  drawChar(b, r)

  const fh = hard ? 2 : 3 // fists tighten
  const fy = GRIP_Y - 1 + (3 - fh)
  if (f < 4) {
    rect(b, rEdge, GRIP_Y - 1, (f + 1) * 2, 3, RUTHLESS.arm) // arms reaching out during the walk-in
  } else {
    if (cx - 2 > rEdge) rect(b, rEdge, GRIP_Y - 1, cx - 2 - rEdge, 3, RUTHLESS.arm) // near arm
    rect(b, cx - 2, fy, 3, fh, RUTHLESS.L) // near fist
    rect(b, cx + cw - 1, fy, 3, fh, RUTHLESS.B) // far fist
  }

  if (dripping) {
    // drops squeezed out under the far fist fall into the cup
    const fx = cx + cw + 1
    for (let d = 0; d < 3; d++) {
      const u = ((p - 1 + d * 2.5) % 7) / 6 // 0..1 along the fall
      const x = fx + (cupX + 2 - fx) * u
      const y = GRIP_Y + 2 + (24 - level - (GRIP_Y + 2)) * u * u
      px(b, x, y, JUICE); px(b, x, y - 1, JUICE_L)
    }
  }

  // spray: round drops fan out of the top of his head (about ±60°) and fall back
  if (f >= 8 && p >= 2 && p <= 8) {
    for (let d = 0; d < 8; d++) {
      const age = p - 2 - (d % 2) * 0.6
      if (age < 0) continue
      const ang = ((d / 7) * 2 - 1) * (Math.PI / 3)
      const x = cxMid + Math.sin(ang) * 1.3 * age
      const y = cy - 1 - Math.cos(ang) * 2.6 * age + 0.45 * age * age
      if (y > cy + 2) continue // drops vanish once they fall back onto him
      px(b, x, y, d % 3 === 0 ? JUICE_L : JUICE)
    }
  }

  // payoff: after every 2nd squeeze a gold gem pops out at the rebound and flies off the top
  const gemAge = n % 2 === 1 ? p - 6 : -1
  if (f >= 8 && gemAge >= 0) {
    const restTop = bottom - 9 + 1
    const gx = cxMid - 2, gy = restTop - 5 - gemAge * 2
    if (gemAge % 2 === 0) { px(b, gx - 1, gy + 1, GLOW); px(b, gx + 5, gy + 1, GLOW); px(b, gx + 2, gy - 1, GLOW) }
    GEM.forEach((row, j) => [...row].forEach((ch2, i) => {
      if (ch2 === '.') return
      px(b, gx + i, gy + j, ch2 === 'W' ? 0xffffff : ch2 === 'D' ? GOLD_D : GOLD)
    }))
  }
}

// ============ press (fast mode) ============
// intro: a press machine drops from above around Claude and lands with a thud (0.6 s),
// Ruthless walks in and grabs the crank (0.8 s), then he cranks fast: one press every 0.6 s.
// The plate flattens Claude, juice runs out a pipe into a cup, and every 2nd press pops a gem.
const STEEL = 0x6b7280, STEEL_L = 0x9ca3af, STEEL_D = 0x374151
const PRESS = [0, 3, 5, 6, 4, 1] // plate drop per frame of one press
const P_INTRO = 14
function pressScene(b: Buf, f: number) {
  const dy = f < 6 ? -24 + f * 4 : 0 // the machine falls in
  const landed = f >= 6
  const thud = f === 6 || f === 7 ? (f % 2 ? -1 : 1) : 0 // a little shake on landing
  const t = Math.max(0, f - P_INTRO)
  const p = t % PRESS.length
  const n = Math.floor(t / PRESS.length)
  const d = f >= P_INTRO ? PRESS[p] : 0

  shadow(b, 15, 22)

  // Claude: stands on the floor until the machine lands, then sits on its tray and gets flattened
  const top = landed ? Math.max(11, 10 + d) : 14
  const ch = landed ? 20 - top + 1 : 10
  const flat = top - 11 // 0..5
  drawChar(b, {
    x: 20 + thud - (flat >= 3 ? 1 : 0), y: top, w: flat >= 3 ? 14 : 12, h: ch, pal: CLAUDE,
    eyes: !landed ? (f >= 2 ? 'bulge' : 'open') : d >= 5 ? 'squint' : f < 10 || d >= 3 ? 'bulge' : 'open',
    bulge: d >= 5 ? 1 : 0, arms: false, legs: !landed,
  })

  // the machine (everything below moves with dy while it falls)
  const y0 = dy
  rect(b, 17, 5 + y0, 2, 21, STEEL); rect(b, 17, 5 + y0, 1, 21, STEEL_L) // left post
  rect(b, 33, 5 + y0, 2, 21, STEEL); rect(b, 34, 5 + y0, 1, 21, STEEL_D) // right post
  rect(b, 16, 5 + y0, 20, 2, STEEL); rect(b, 16, 5 + y0, 20, 1, STEEL_L) // top beam
  const plateTop = 7 + d + y0
  rect(b, 25, 7 + y0, 2, plateTop - 7 - y0, STEEL_D) // screw rod, shows as the plate drops
  rect(b, 19, plateTop, 14, 3, STEEL_D); rect(b, 19, plateTop, 14, 1, STEEL_L) // the plate
  rect(b, 17, 21 + y0, 18, 2, WOOD); rect(b, 17, 21 + y0, 18, 1, WOOD_L) // tray
  // pipe out of the tray to the cup
  rect(b, 35, 21 + y0, 3, 1, STEEL)
  // crank wheel on the left post, the handle turns once per press
  const wx = 14, wy = 15 + y0
  const ang = f >= P_INTRO ? (p / PRESS.length) * Math.PI * 2 - Math.PI / 2 : -Math.PI / 2
  for (let a = 0; a < 32; a++) px(b, wx + Math.cos(a * Math.PI / 16) * 3, wy + Math.sin(a * Math.PI / 16) * 3, STEEL_L) // rim
  for (const s of [0, Math.PI / 2]) for (let r = -2; r <= 2; r++) px(b, wx + Math.cos(ang + s) * r, wy + Math.sin(ang + s) * r, STEEL) // turning spokes
  px(b, wx, wy, STEEL_D)
  const hx = Math.round(wx + Math.cos(ang) * 3), hy = Math.round(wy + Math.sin(ang) * 3)

  // dust puffs on landing
  if (f >= 6 && f <= 8) {
    const s = f - 6
    for (const k of [-1, 1]) { px(b, 26 + k * (11 + s * 2), 24 - s, 0x8b8b8b); px(b, 26 + k * (12 + s * 2), 25 - s, 0x6b6b6b) }
  }

  // Ruthless walks in from the left and cranks
  const rx = f < 8 ? -14 : Math.min(0, -14 + (f - 8) * 3)
  const strain = d >= 5
  drawChar(b, strain
    ? { x: rx, y: 15, w: 13, h: 9, pal: RUTHLESS, eyes: 'mad', brow: 2, look: 2, arms: false }
    : { x: rx, y: 14, w: 12, h: 10, pal: RUTHLESS, eyes: 'mad', brow: 1, look: 2, arms: false })
  if (f >= 12) { // arm to the handle, fist on it
    const ax = rx + 12, ay = 18
    for (let k = 0; k <= 10; k++) {
      const x = ax + (hx - ax) * k / 10, y = ay + (hy - ay) * k / 10
      px(b, x, y, RUTHLESS.arm); px(b, x, y + 1, RUTHLESS.D)
    }
    rect(b, hx - 1, hy - 1, 3, 3, RUTHLESS.L)
  } else {
    px(b, hx, hy, STEEL_L)
  }

  // the cup under the pipe: fills one level every 2 presses, then a fresh cup
  const cupX = 35
  rect(b, cupX, 22, 1, 4, GLASS); rect(b, cupX + 4, 22, 1, 4, GLASS); rect(b, cupX, 25, 5, 1, GLASS)
  if (f >= P_INTRO) {
    const level = Math.min(3, Math.floor(n / 2) % 5)
    if (level > 0) { rect(b, cupX + 1, 25 - level, 3, level, JUICE); rect(b, cupX + 1, 25 - level, 3, 1, JUICE_L) }
    if (d >= 3) { // juice on the tray, running to the pipe, dripping in
      rect(b, 22, 20, 9, 1, JUICE)
      px(b, 37, 22 + (p % 2), JUICE_L)
    }
    // squirts out of both sides of Claude while flattened
    if (d >= 5) for (const k of [-1, 1]) {
      const sx = 26 + k * (8 + (p - 2)), sy = 17 - (p - 2)
      if (sx > 18 && sx < 33) { px(b, sx, sy, JUICE); px(b, sx + k, sy + 1, JUICE_L) }
    }
    // speed lines by the plate while it slams down
    if (p >= 1 && p <= 3) for (const x of [21, 30]) rect(b, x, plateTop - 2, 1, 1, 0xd1d5db)
    // a gem pops out of the top every 2nd press
    if (n % 2 === 1 && p >= 3) {
      const gx = 37, gy = 15 - (p - 3) * 3
      GEM.forEach((row, j) => [...row].forEach((c2, i) => {
        if (c2 === '.') return
        px(b, gx - 2 + i, gy + j, c2 === 'W' ? 0xffffff : c2 === 'D' ? GOLD_D : GOLD)
      }))
    }
  }
}

// ============ Claude's revenge (round 1 already scored 9+) ============
const ANGER = 0xe5534b
// a small red cross by his head: he's had enough
function angerMark(b: Buf, x: number, y: number) {
  px(b, x, y, ANGER); px(b, x + 2, y, ANGER); px(b, x + 1, y + 1, ANGER); px(b, x, y + 2, ANGER); px(b, x + 2, y + 2, ANGER)
}
function drawGem(b: Buf, gx: number, gy: number, sparkle: boolean) {
  if (sparkle) { px(b, gx - 1, gy + 1, GLOW); px(b, gx + 5, gy + 1, GLOW); px(b, gx + 2, gy - 1, GLOW) }
  GEM.forEach((row, j) => [...row].forEach((c2, i) => {
    if (c2 === '.') return
    px(b, gx + i, gy + j, c2 === 'W' ? 0xffffff : c2 === 'D' ? GOLD_D : GOLD)
  }))
}
function burst(b: Buf, x: number, y: number, t: number) {
  const r = 1 + t * 2
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2
    px(b, x + Math.cos(ang) * r, y + Math.sin(ang) * r, a % 2 ? GOLD : 0xffffff)
  }
}
// Claude standing proud with his gem: the result nobody had to squeeze out of him
function proud(b: Buf, x: number, f: number) {
  const base: Char = { x, y: FLOOR - 11, w: 13, h: 10, pal: CLAUDE, eyes: f % 37 < 2 ? 'blink' : 'open' }
  shadow(b, x, 13)
  drawChar(b, breathe(base, f))
  drawGem(b, x + 4, 7 + (Math.floor(f / 5) % 2), Math.floor(f / 3) % 2 === 0)
}

// from the squeeze: Ruthless still has him by the waist, but Claude gets angry, puffs up,
// breaks the grip and shoves him off the stage. Later Ruthless peeks back in, still mad.
function revengeScene(b: Buf, f: number) {
  const cupX = 33
  rect(b, cupX, 21, 1, 5, GLASS); rect(b, cupX + 4, 21, 1, 5, GLASS); rect(b, cupX, 25, 5, 1, GLASS)
  rect(b, cupX + 1, 24, 3, 1, JUICE) // barely anything came out of him

  if (f < 10) { // the grip, as the squeeze left it
    const shake = f >= 4 && f % 2 === 0 ? 1 : 0
    const puff = f >= 6 ? 1 : 0
    const cx = 19 + shake, cw = 13, cy = 12
    shadow(b, 3, 16); shadow(b, 20, 10)
    const rEdge = 16
    rect(b, rEdge, GRIP_Y - 1, cx + cw + 3 - rEdge, 3, RUTHLESS.D) // far arm, behind Claude
    drawChar(b, { x: cx, y: cy, w: cw, h: 10, pal: CLAUDE, eyes: f < 3 ? 'squint' : f < 5 ? 'open' : 'angry', brow: f >= 8 ? 2 : 1, bulge: puff, arms: false })
    drawChar(b, { x: 3, y: FLOOR - 11, w: 13, h: 10, pal: RUTHLESS, eyes: f >= 6 ? 'bulge' : 'mad', brow: 1, look: 2, arms: false })
    if (cx - 2 > rEdge) rect(b, rEdge, GRIP_Y - 1, cx - 2 - rEdge, 3, RUTHLESS.arm) // near arm
    rect(b, cx - 2 - puff, GRIP_Y - 1, 3, 3, RUTHLESS.L) // fists pushed apart as he puffs up
    rect(b, cx + cw - 1 + puff, GRIP_Y - 1, 3, 3, RUTHLESS.B)
    if (f >= 5) angerMark(b, cx + cw - 1, cy - 3)
    return
  }

  const t = f - 10
  // Ruthless is knocked off to the left with a little hop, kicking up dust
  const rx = 3 - (t + 1) * 3
  if (rx > -14) {
    const hop = t < 3 ? [1, 2, 1][t] : 0
    shadow(b, rx, 14)
    drawChar(b, { x: rx, y: FLOOR - 11 - hop, w: 13, h: 10, pal: RUTHLESS, eyes: 'bulge', look: -1, arms: false })
    if (t >= 1) { px(b, rx + 14 + (t % 2), 24, 0x8b8b8b); px(b, rx + 16, 25, 0x6b6b6b); px(b, rx + 18 - (t % 2), 23, 0x6b6b6b) }
  }
  // Ruthless peeks back in from the edge, glaring
  if (f >= 34) drawChar(b, { x: -6, y: FLOOR - 11, w: 13, h: 10, pal: RUTHLESS, eyes: f % 53 < 2 ? 'blink' : 'mad', brow: 2, look: 2, arms: false })

  if (t >= 10) { proud(b, 14, f); return }

  // Claude drops to the floor and lunges into the shove, then steps back to the middle
  const cx = t < 3 ? 19 - t : t < 8 ? 16 : 16 - (t - 7)
  const cy = t === 0 ? FLOOR - 12 : FLOOR - 11
  const pushing = t < 6
  shadow(b, cx, 13)
  drawChar(b, { x: cx, y: cy, w: 13, h: 10, pal: CLAUDE, eyes: t < 8 ? 'angry' : 'open', brow: 2, arms: !pushing })
  if (pushing) {
    const ay = cy + 4
    rect(b, cx - 4, ay, 4, 2, CLAUDE.arm) // the shoving arm
    rect(b, cx - 6, ay - 1, 2, 4, CLAUDE.L) // open palm
    rect(b, cx + 13, ay, 2, 2, CLAUDE.arm) // the other arm stays at his side
  }
  if (t < 3) burst(b, cx - 7, cy + 5, t)
}

// from the press (fast mode): Claude gets angry under the plate, pushes it back up, and the
// whole machine bursts apart. He jumps out; Ruthless falls on his backside and the wheel rolls off.
type Piece = { x: number; y: number; w: number; h: number; vx: number; vy: number; c: number }
const DEBRIS: Piece[] = [
  { x: 16, y: 5, w: 10, h: 2, vx: -2.6, vy: -2.2, c: STEEL }, // top beam, two halves
  { x: 26, y: 5, w: 10, h: 2, vx: 2.6, vy: -2.4, c: STEEL_L },
  { x: 19, y: 8, w: 7, h: 2, vx: -1.8, vy: -3.0, c: STEEL_D }, // the plate, split
  { x: 26, y: 8, w: 7, h: 2, vx: 1.8, vy: -2.8, c: STEEL_D },
  { x: 17, y: 7, w: 2, h: 6, vx: -0.5, vy: -1.2, c: STEEL_L }, // tops of the posts
  { x: 33, y: 7, w: 2, h: 6, vx: 1.5, vy: -1.4, c: STEEL_L },
  { x: 25, y: 7, w: 2, h: 2, vx: -0.3, vy: -3.4, c: STEEL_D }, // a chunk of the screw rod
]
const GRAV = 0.5
function piece(b: Buf, p: Piece, t: number) {
  const thin = Math.min(p.w, p.h), long = Math.max(p.w, p.h)
  const rest = FLOOR - thin + 1
  const land = (-p.vy + Math.sqrt(p.vy * p.vy + 2 * GRAV * (rest - p.y))) / GRAV // when it hits the floor
  const tt = Math.min(t, land)
  const x = p.x + p.vx * tt
  if (t >= land) rect(b, x, rest, long, thin, p.c) // lies flat once it lands
  else rect(b, x, p.y + p.vy * tt + 0.5 * GRAV * tt * tt, p.w, p.h, p.c)
}
function breakoutScene(b: Buf, f: number) {
  const cupX = 35
  rect(b, cupX, 22, 1, 4, GLASS); rect(b, cupX + 4, 22, 1, 4, GLASS); rect(b, cupX, 25, 5, 1, GLASS)
  rect(b, cupX + 1, 24, 3, 1, JUICE)
  rect(b, 35, 21, 3, 1, STEEL) // pipe

  if (f < 10) { // still under the plate, pushing it back up
    const d = f < 5 ? 6 : 10 - f // plate drop: 6 → 1
    const tremble = f >= 3 && f % 2 ? 1 : 0
    shadow(b, 15, 22)
    const top = Math.max(11, 10 + d)
    const flat = top - 11
    drawChar(b, {
      x: 20 - (flat >= 3 ? 1 : 0) + tremble, y: top, w: flat >= 3 ? 14 : 12, h: 20 - top + 1, pal: CLAUDE,
      eyes: f < 4 ? 'squint' : 'angry', brow: f >= 7 ? 2 : 1, arms: false, legs: false,
    })
    rect(b, 17, 5, 2, 21, STEEL); rect(b, 17, 5, 1, 21, STEEL_L)
    rect(b, 33, 5, 2, 21, STEEL); rect(b, 34, 5, 1, 21, STEEL_D)
    rect(b, 16, 5, 20, 2, STEEL); rect(b, 16, 5, 20, 1, STEEL_L)
    const plateTop = 7 + d
    rect(b, 25, 7, 2, plateTop - 7, STEEL_D)
    rect(b, 19 + tremble, plateTop, 14, 3, STEEL_D); rect(b, 19 + tremble, plateTop, 14, 1, STEEL_L)
    rect(b, 17, 21, 18, 2, WOOD); rect(b, 17, 21, 18, 1, WOOD_L)
    for (let a = 0; a < 32; a++) px(b, 14 + Math.cos(a * Math.PI / 16) * 3, 15 + Math.sin(a * Math.PI / 16) * 3, STEEL_L)
    rect(b, 14, 13, 1, 5, STEEL); rect(b, 12, 15, 5, 1, STEEL); px(b, 14, 15, STEEL_D)
    // Ruthless still on the crank, until he sees what's coming
    drawChar(b, f < 5
      ? { x: 0, y: 15, w: 13, h: 9, pal: RUTHLESS, eyes: 'mad', brow: 2, look: 2, arms: false }
      : { x: 0, y: 14, w: 12, h: 10, pal: RUTHLESS, eyes: 'bulge', look: 2, arms: false })
    rect(b, 12, 17, 2, 1, RUTHLESS.arm); rect(b, 13, 13, 1, 5, RUTHLESS.arm); rect(b, 13, 11, 3, 3, RUTHLESS.L)
    if (f >= 4) angerMark(b, 31, top - 4)
    return
  }

  const t = f - 10
  rect(b, 16, 26, 8, 1, JUICE) // juice spilled on the floor
  // what's left: two broken stumps and the tray
  rect(b, 17, 19, 2, 7, STEEL); rect(b, 17, 19, 1, 7, STEEL_L); px(b, 18, 18, STEEL)
  rect(b, 33, 19, 2, 7, STEEL); rect(b, 34, 19, 1, 7, STEEL_D); px(b, 33, 18, STEEL)
  rect(b, 17, 21, 18, 2, WOOD); rect(b, 17, 21, 18, 1, WOOD_L)

  // Ruthless is thrown back and lands sitting, then glares
  if (t < 4) drawChar(b, { x: -t, y: FLOOR - 11, w: 12, h: 10, pal: RUTHLESS, eyes: 'bulge', look: 2, arms: false })
  else {
    shadow(b, -2, 13)
    drawChar(b, { x: -2, y: FLOOR - 9, w: 13, h: 8, pal: RUTHLESS, eyes: t < 14 ? 'bulge' : f % 53 < 2 ? 'blink' : 'mad', brow: 2, look: 2 })
  }

  // the crank wheel drops off and rolls away to the left
  const wx = 14 - t * 0.8, wy = Math.min(22, 15 + 0.5 * t * t), spin = -t * 0.8
  for (let a = 0; a < 32; a++) px(b, wx + Math.cos(a * Math.PI / 16) * 3, wy + Math.sin(a * Math.PI / 16) * 3, STEEL_L)
  for (const s of [0, Math.PI / 2]) for (let r = -2; r <= 2; r++) px(b, wx + Math.cos(spin + s) * r, wy + Math.sin(spin + s) * r, STEEL)

  for (const p of DEBRIS) piece(b, p, t)
  if (t < 3) burst(b, 26, 11, t)

  if (t >= 8) { proud(b, 22, f); if (t < 11) for (const k of [0, 12]) px(b, 22 + k + (t - 8) * (k ? 1 : -1), 25, 0x8b8b8b); return }
  // Claude jumps out of the wreck, an arc down to the floor
  const u = t / 8
  drawChar(b, { x: Math.round(19 + 3 * u), y: Math.round(11 + 3 * u - 9 * Math.sin(Math.PI * u)), w: 13, h: 10, pal: CLAUDE, eyes: 'angry', brow: 2 })
}

// ============ encode to Raster cells ============
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function toBase64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '=='
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '='
  }
  return out
}

const UPPER = 0x2580, LOWER = 0x2584, SPACE = 0x20
export function encode(b: Buf, cols: number): string {
  const rows = H / 2
  const off = Math.floor((W - cols) / 2) // center the stage in the pane
  const words = new Uint32Array(cols * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c + off
      const top = x >= 0 && x < W ? b[2 * r * W + x] : NONE
      const bot = x >= 0 && x < W ? b[(2 * r + 1) * W + x] : NONE
      const o = (r * cols + c) * 3
      if (top === NONE && bot === NONE) { words[o] = SPACE; words[o + 1] = DEFAULT; words[o + 2] = DEFAULT }
      else if (top === NONE) { words[o] = LOWER; words[o + 1] = bot; words[o + 2] = DEFAULT }
      else { words[o] = UPPER; words[o + 1] = top; words[o + 2] = bot === NONE ? DEFAULT : bot }
    }
  }
  return toBase64(new Uint8Array(words.buffer))
}

// ============ progress HUD (squeeze only) ============
// top center, so it survives a narrow pane cropping the sides:
// four pips = review rounds (lit when done), and a 10-segment bar = the latest score
export type Hud = { round: number; score: number }
const MAX_ROUNDS = 4
function drawHud(b: Buf, hud: Hud) {
  const pipsX = Math.round(W / 2 - (MAX_ROUNDS * 3 - 1) / 2)
  for (let k = 0; k < MAX_ROUNDS; k++) {
    rect(b, pipsX + k * 3, 0, 2, 2, k < hud.round ? 0xffffff : 0x2e2e2e)
  }
  const score = Math.max(0, Math.min(10, Math.round(hud.score)))
  const col = score >= 9 ? 0x3fb950 : score >= 6 ? 0xd29922 : 0xe5534b
  const barX = Math.round(W / 2 - 19 / 2)
  for (let k = 0; k < 10; k++) rect(b, barX + k * 2, 3, 1, 2, k < score ? col : 0x2a2a2a)
}

// raw pixels of one frame; f counts frames since the mode began
export function pixels(m: Mode, f: number, hud?: Hud): Int32Array {
  const b = newBuf()
  if (m === 'squeeze') squeezeScene(b, f)
  else if (m === 'press') pressScene(b, f)
  else if (m === 'revenge') revengeScene(b, f)
  else if (m === 'breakout') breakoutScene(b, f)
  else if (m === 'typing') typingScene(b, f)
  else idleScene(b, f)
  if (m !== 'idle' && m !== 'typing' && hud && hud.round > 0) drawHud(b, hud)
  return b
}

export function stage(m: Mode, f: number, cols: number, hud?: Hud): string {
  return encode(pixels(m, f, hud), cols)
}
