// Pixel art for the Ruthless Claude pane. Pure functions: no engine calls.
// Each terminal cell shows two square pixels stacked ('▀': fg = top, bg = bottom).

export type Mode = 'idle' | 'typing' | 'squeeze'

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
  else if (m === 'typing') typingScene(b, f)
  else idleScene(b, f)
  if (m === 'squeeze' && hud && hud.round > 0) drawHud(b, hud)
  return b
}

export function stage(m: Mode, f: number, cols: number, hud?: Hud): string {
  return encode(pixels(m, f, hud), cols)
}
