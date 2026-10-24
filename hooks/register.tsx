import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import type { Mode } from '../types'
import { H, W, stage } from './art'

const PANE = 'ruthless-claude'
const TITLE = 'Ruthless Claude'
const STAGE = 'stage'

// the mode lives in state so the pane redraws; frames are blitted straight to the Raster
const mode = atom({ plugin: 'ruthless-claude', key: 'mode' } as const, 'idle' as Mode, { shape: 'mode-1' })

// ============ animation loop ============
let timer: Timer | undefined
let tick = 0
let curMode: Mode = 'idle'
let modeStart = 0 // tick the current mode began, so each scene starts from its first frame
let mountedCols = 0 // the Raster's width as last drawn; blit must match it
const sceneFrame = () => tick - modeStart
const activeAgents = new Set<string>()
let ruthlessRun = false

function startClock($: any) {
  if (timer) return
  timer = $.clock.every(100, () => {
    tick = (tick + 1) % 100000
    if (!mountedCols) return
    void $.ui.blit({ requestId: PANE, key: STAGE, columns: mountedCols, rows: H / 2, cells: stage(curMode, sceneFrame(), mountedCols) })
      .catch(() => { mountedCols = 0 }) // pane closed: stop drawing until it renders again
  })
}
function stopClock() {
  timer?.cancel()
  timer = undefined
}

async function setMode($: any, m: Mode) {
  if (m !== curMode) modeStart = tick
  curMode = m
  await update($, mode, () => m)
}

// shown once after install, and any time with /ruthless-help
const HELP = [
  'How to use Ruthless Claude:',
  '  /ruthless-claude <task>            a separate reviewer critiques and scores the draft; Claude fixes it, until 9/10 (max 4 rounds)',
  '  /ruthless-claude <task> --compare  also shows the first draft vs the final one, and what improved (uses more tokens)',
  '  /ruthless-pane                     opens the side pane (it opens by itself when the terminal is wide enough to dock it)',
  '  /ruthless-pane off | on            stop / resume opening the pane by itself',
  '  /ruthless-help                     shows this list again',
  'Saying "Ruthless Claude", "ruthless mode" or "squeeze it" in a prompt usually triggers it too. Best for code and costly tasks; plain Claude is faster and cheaper for quick questions.',
  'Replies follow your language. بالعربي: اكتب طلبك بالعربي وبيرد عليك بالعربي، واكتب "قارن" في آخر الطلب بدل --compare.',
]

// exact trigger phrases only, so a prompt that merely contains "ruthless" doesn't start the squeeze animation
const RUTHLESS_WORDS = /ruthless claude|ruthless mode|squeeze it|كلود القاسي|النسخة القاسية|اعصره/i

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ruthless-pane', description: 'Open the Ruthless Claude side pane' })
    await $.command.register({ name: 'ruthless-help', description: 'How to use Ruthless Claude and all its commands' })
    // headless runs (claude -p, SDK) get no guide, no pane and no animation clock
    if (!e.isInteractive) return next(e)
    if (!(await $.store.get('welcomed'))) {
      for (const line of HELP) $.ui.log(line)
      await $.store.set('welcomed', true)
    }
    await setMode($, 'idle')
    startClock($)
    if ((await $.store.get('autoOpen')) !== false) void $.ui.open({ id: PANE, title: TITLE }).catch(() => {})
    return next(e)
  }).catch(($, e, next) => next(e)) // a failure here must never block the session

  // /ruthless-pane         open it now
  // /ruthless-pane off|on  stop / resume opening it by itself at session start
  on('command.run', { command: 'ruthless-pane' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'on') {
      await $.store.set('autoOpen', arg === 'on')
      return { text: arg === 'off' ? 'The pane will no longer open by itself. /ruthless-pane still opens it.' : 'The pane will open by itself again.' }
    }
    try {
      const r: any = await $.ui.open({ id: PANE, title: TITLE })
      return { text: r?.isPlaced === false ? 'Not enough room to dock the pane. Widen the terminal (about 144 columns) and it will appear.' : 'Ruthless Claude pane opened.' }
    } catch {
      return { text: 'Could not open the Ruthless Claude pane here.' }
    }
  })

  on('command.run', { command: 'ruthless-help' }, async () => ({ text: HELP.join('\n') }))

  on('skill.prompt', async ($, e, next) => {
    if (e.skill.toLowerCase().includes('ruthless')) {
      ruthlessRun = true
      await setMode($, 'squeeze')
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (RUTHLESS_WORDS.test(e.text)) {
      ruthlessRun = true
      await setMode($, 'squeeze')
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // never hold up the person's prompt

  on('turn.start', async ($, e, next) => {
    if (e.agentId) activeAgents.add(e.agentId)
    else await setMode($, ruthlessRun ? 'squeeze' : 'typing')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) activeAgents.delete(e.agentId)
    if (!e.agentId && activeAgents.size === 0) {
      ruthlessRun = false
      await setMode($, 'idle')
    }
    return result
  })

  on('session.end', async ($, e, next) => {
    stopClock()
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Raster } = $.ui.resolve(e)
    const m = await read($, mode)
    if (m !== curMode) { modeStart = tick; curMode = m }
    const body = (e as any).props?.bodyColumns ?? e.viewport?.columns ?? W
    const cols = Math.max(20, Math.min(W, body))
    mountedCols = cols

    // no labels: the animation speaks for itself
    return (
      <Box flexDirection="column">
        <Raster key={STAGE} columns={cols} rows={H / 2} cells={stage(m, sceneFrame(), cols)} />
      </Box>
    )
  })
}
