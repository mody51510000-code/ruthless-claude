import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import type { Mode } from '../types'

const PANE = 'ruthless-claude'
const TITLE = 'Ruthless Claude'
const STAGE = 'stage'

// the mode lives in state so the label redraws; frames are blitted straight to the Raster
const mode = atom({ plugin: 'ruthless-claude', key: 'mode' } as const, 'idle' as Mode, { shape: 'mode-1' })
const frame = atom({ plugin: 'ruthless-claude', key: 'frame' } as const, 0, { shape: 'frame-1' })

import { H, W, stage } from './art'

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
      .catch(() => {})
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
  'Ruthless Claude is installed. Here is how to use it:',
  '  /ruthless-claude <task>            Ruthless Claude squeezes normal Claude through review rounds until the result scores 9/10 (max 4 rounds)',
  '  /ruthless-claude <task> --compare  also shows normal Claude\'s first draft vs the final one, and what improved (uses more tokens)',
  '  /ruthless-pane                     opens the side pane (it opens by itself in terminals 144+ columns wide)',
  '  /ruthless-help                     shows this list again',
  'You can also just say "Ruthless Claude" or "squeeze it" in a prompt. Best for code and costly tasks; plain Claude is faster for quick questions.',
  'Replies follow your language. بالعربي: اكتب طلبك بالعربي وبيرد عليك بالعربي، و"قارن" بدل --compare.',
]

const RUTHLESS_WORDS =/ruthless|squeeze it|كلود القاسي|النسخة القاسية|اعصر/i

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ruthless-pane', description: 'Open the Ruthless Claude side pane' })
    await $.command.register({ name: 'ruthless-help', description: 'How to use Ruthless Claude and all its commands' })
    if (!(await $.store.get('welcomed'))) {
      for (const line of HELP) $.ui.log(line)
      await $.store.set('welcomed', true)
    }
    await setMode($, 'idle')
    startClock($)
    void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'ruthless-pane' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Ruthless Claude pane opened.' }
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
    await read($, frame) // kept so older state stays valid
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
