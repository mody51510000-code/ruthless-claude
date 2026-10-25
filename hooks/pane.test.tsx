import { expect, test } from 'claude-code/testing'

import { H, W, pixels, stage } from './art'

const pane = (bodyColumns: number) =>
  ({
    plugin: 'ruthless-claude',
    component: 'Pane',
    requestId: 'ruthless-claude',
    surface: 'terminal',
    props: {
      title: 'Ruthless Claude',
      isFocused: false,
      bodyColumns,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  }) as const

test('the pane draws the stage with no labels, wide and narrow', async ($, on) => {
  on('command.register', () => ({ value: { command: 'ruthless-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: true }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const cols of [60, 30]) {
    const ui = await $.ui.mount(pane(cols))
    expect(await ui.find({ type: 'Raster' })).toBeTruthy()
    expect(await ui.find({ type: 'Text' })).toBeFalsy()
    await ui.unmount()
  }
})

test('the guide prints once after install, and /ruthless-help shows it any time', async ($, on) => {
  const logs: string[] = []
  on('command.register', () => ({ value: { command: 'x' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', (_, e: any) => { logs.push(e.text); return { value: undefined } })
  const store: Record<string, unknown> = {}
  on('store.get', (_, e: any) => ({ value: store[e.key] }))
  on('store.set', (_, e: any) => { store[e.key] = e.value; return { value: undefined } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(logs.some(l => l.includes('/ruthless-help'))).toBe(true)

  logs.length = 0
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(logs.length).toBe(0) // only once

  const r: any = await $.command.run({ command: 'ruthless-help', args: '' } as any)
  expect(r.text).toContain('--compare')
})

test('a headless session gets no guide and no pane', async ($, on) => {
  const logs: string[] = []
  let opened = false
  on('command.register', () => ({ value: { command: 'x' } }))
  on('ui.open', () => { opened = true; return { value: { isPlaced: true } } })
  on('ui.log', (_, e: any) => { logs.push(e.text); return { value: undefined } })
  on('store.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  expect(logs.length).toBe(0)
  expect(opened).toBe(false)
})

test('/ruthless-pane off stops the auto-open, and says so honestly when there is no room', async ($, on) => {
  let opens = 0
  let placed = true
  const store: Record<string, unknown> = { welcomed: true }
  on('command.register', () => ({ value: { command: 'x' } }))
  on('ui.open', () => { opens++; return { value: { isPlaced: placed } } })
  on('store.get', (_, e: any) => ({ value: store[e.key] }))
  on('store.set', (_, e: any) => { store[e.key] = e.value; return { value: undefined } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  const off: any = await $.command.run({ command: 'ruthless-pane', args: 'off' } as any)
  expect(off.text).toContain('no longer')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opens).toBe(0)

  placed = false
  const r: any = await $.command.run({ command: 'ruthless-pane', args: '' } as any)
  expect(r.text).toContain('Not enough room')
})

test('the progress tool feeds the pane: round pips and a score bar in the squeeze', async ($, on) => {
  const tools: string[] = []
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', (_, e: any) => { tools.push(e.name); return { value: { tool: 'mcp__ruthless-claude__' + e.name } } })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: true }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(tools).toContain('progress')

  const r: any = await $.tool.call({ tool: 'mcp__ruthless-claude__progress', round: 2, score: 7 } as any)
  expect(String(r.result)).toContain('round 2')

  // the HUD only draws in the squeeze, and changes the pixels at the top center
  const plain = pixels('squeeze', 9)
  const withHud = pixels('squeeze', 9, { round: 2, score: 7 })
  const lit = (b: Int32Array) => Array.from(b.slice(0, 5 * W)).filter(v => v >= 0).length
  expect(lit(withHud)).toBeGreaterThan(lit(plain))
  expect(pixels('idle', 9, { round: 2, score: 7 })).toEqual(pixels('idle', 9))
})

test('fast mode plays the press machine, and only for a real fast request', async ($, on) => {
  const modes: string[] = []
  on('command.register', () => ({ value: { command: 'x' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: true }))
  on('state.set', (_, e: any) => { modes.push(e.value?.value ?? e.value); return { value: { isSet: true } } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('skill.prompt', (_, e: any) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  // the skill body alone saying --fast does not count, nor "fast" inside the task
  await $.skill.prompt({ skill: 'ruthless-claude', text: 'skill body mentions --fast\n\nARGUMENTS: write a fast parser' } as any)
  expect(modes[modes.length - 1]).toBe('squeeze')

  await $.skill.prompt({ skill: 'ruthless-claude', text: 'skill body mentions --fast\n\nARGUMENTS: اكتب دالة تقرأ التواريخ بسرعة' } as any)
  expect(modes[modes.length - 1]).toBe('press')

  // the machine drops in, then the plate moves between frames
  expect(pixels('press', 0)).not.toEqual(pixels('press', 10))
  expect(pixels('press', 15)).not.toEqual(pixels('press', 17))
})

test("a 9+ first round plays Claude's revenge; later rounds and lower scores don't", async ($, on) => {
  const modes: string[] = []
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', (_, e: any) => ({ value: { tool: 'mcp__ruthless-claude__' + e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: true }))
  on('state.set', (_, e: any) => { modes.push(e.value?.value ?? e.value); return { value: { isSet: true } } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const last = () => modes[modes.length - 1]

  // a low first round, then 9 in round 2: that's a normal squeeze, not a revenge
  await $.tool.call({ tool: 'mcp__ruthless-claude__progress', round: 1, score: 6 } as any)
  expect(last()).toBe('squeeze')
  await $.tool.call({ tool: 'mcp__ruthless-claude__progress', round: 2, score: 9 } as any)
  expect(last()).toBe('squeeze')

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const r: any = await $.tool.call({ tool: 'mcp__ruthless-claude__progress', round: 1, score: 9 } as any)
  expect(last()).toBe('revenge')
  expect(String(r.result)).toContain('revenge')

  // fast mode breaks out of the press instead
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ruthless-claude__progress', round: 1, score: 9.5, fast: true } as any)
  expect(last()).toBe('breakout')
})

test('the revenge scenes move, and end on Claude standing with the gem', () => {
  for (const m of ['revenge', 'breakout'] as const) {
    expect(pixels(m, 0)).not.toEqual(pixels(m, 8)) // he gets angry
    expect(pixels(m, 10)).not.toEqual(pixels(m, 14)) // the break-out
    // at the end the gem (gold) floats over his head
    const end = pixels(m, 60)
    expect(Array.from(end).includes(0xffd54a)).toBe(true)
  }
  // the HUD shows in the revenge too
  expect(pixels('revenge', 30, { round: 1, score: 9 })).not.toEqual(pixels('revenge', 30))
})

test('every frame of every scene encodes to the right size', () => {
  for (const m of ['idle', 'typing', 'squeeze', 'press', 'revenge', 'breakout'] as const) {
    for (let f = 0; f < 120; f++) {
      expect(pixels(m, f).length).toBe(W * H)
      for (const cols of [20, 33, W]) {
        // base64 of cols * rows * 3 u32 words
        const bytes = cols * (H / 2) * 3 * 4
        expect(stage(m, f, cols).length).toBe(Math.ceil(bytes / 3) * 4)
      }
    }
  }
})
