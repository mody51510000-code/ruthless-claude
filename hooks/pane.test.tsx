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

test('every frame of every scene encodes to the right size', () => {
  for (const m of ['idle', 'typing', 'squeeze'] as const) {
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
