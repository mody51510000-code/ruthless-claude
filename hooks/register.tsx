import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import type { Mode } from '../types'
import { H, W, stage } from './art'
import type { Hud } from './art'

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
let fastRun = false // fast mode: the press machine instead of the hand squeeze
const squeezeMode = (): Mode => (fastRun ? 'press' : 'squeeze')
// the squeeze's progress, reported by the skill through the progress tool after each review
const hud: Hud = { round: 0, score: 0 }
const PROGRESS_TOOL = 'mcp__ruthless-claude__progress'

function startClock($: any) {
  if (timer) return
  timer = $.clock.every(100, () => {
    tick = (tick + 1) % 100000
    if (!mountedCols) return
    void $.ui.blit({ requestId: PANE, key: STAGE, columns: mountedCols, rows: H / 2, cells: stage(curMode, sceneFrame(), mountedCols, hud) })
      .catch(() => { mountedCols = 0 }) // pane closed: stop drawing until it renders again
  })
}
function stopClock() {
  timer?.cancel()
  timer = undefined
}

async function setMode($: any, m: Mode) {
  if (m !== curMode) {
    modeStart = tick
    if (m !== 'typing') { hud.round = 0; hud.score = 0 } // a fresh squeeze starts empty
  }
  curMode = m
  await update($, mode, () => m)
}

// shown once after install, and any time with /ruthless-help
const HELP = [
  'Heads up: Ruthless Claude is slow on purpose. Each round is a full review with real tests, so a real project can take 30+ minutes and many tokens. Use it when you need to be sure there are no mistakes.',
  'How to use Ruthless Claude:',
  '  /ruthless-claude <task>            a separate reviewer critiques and scores the draft; Claude fixes it, until 9/10 (max 4 rounds)',
  '  /ruthless-claude <task> --compare  also shows the first draft vs the final one, and what improved (uses more tokens)',
  '  /ruthless-claude review [path]     squeezes your existing code (a file, a folder, or your uncommitted changes)',
  '  /ruthless-claude <task> --fast     3 reviewers at once: fewer rounds, faster, more tokens',
  '  /ruthless-pane                     opens the side pane (it opens by itself when the terminal is wide enough to dock it)',
  '  /ruthless-pane off | on            stop / resume opening the pane by itself',
  '  /ruthless-help                     shows this list again',
  'Saying "Ruthless Claude", "ruthless mode" or "squeeze it" in a prompt usually triggers it too. Best for code and costly tasks; plain Claude is faster and cheaper for quick questions.',
  'Replies follow your language. بالعربي: اكتب طلبك بالعربي وبيرد عليك بالعربي، واكتب "قارن" في آخر الطلب بدل --compare، و"بسرعة" بدل --fast.',
  'تنبيه: الأداة تاخذ وقت (المشروع الحقيقي ممكن ياخذ نص ساعة أو أكثر). استخدمها بس إذا تبغا تتأكد إن شغلك ما فيه ولا غلط.',
]

// exact trigger phrases only, so a prompt that merely contains "ruthless" doesn't start the squeeze animation
const RUTHLESS_WORDS = /ruthless claude|ruthless mode|squeeze it|كلود القاسي|النسخة القاسية|اعصره/i
// fast mode: --fast anywhere, or "بسرعة" as the last word of the request
const FAST_WORDS = /--fast\b|(?:^|\s)بسرع[ةه][\s.!؟?]*$/i
// a skill's prompt text holds the skill body too; only its arguments say what the person asked
const skillArgs = (text: string) => /ARGUMENTS:([\s\S]*)$/.exec(text)?.[1] ?? ''

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ruthless-pane', description: 'Open the Ruthless Claude side pane (off / on: stop or resume auto-open)' })
    await $.command.register({ name: 'ruthless-help', description: 'How to use Ruthless Claude and all its commands' })
    // the progress tool is a nice-to-have: if it can't register, everything else still starts
    await $.tool.register({
      name: 'progress',
      description: 'Ruthless Claude skill only: report a finished review round so the side pane can show it. Call once after each review with the round number and the reviewer\'s score.',
      inputSchema: {
        type: 'object',
        properties: {
          round: { type: 'integer', minimum: 1, maximum: 4, description: 'the review round just finished (1-4)' },
          score: { type: 'number', minimum: 0, maximum: 10, description: 'the reviewer\'s score for that round' },
          fast: { type: 'boolean', description: 'true when the run is in fast mode (parallel reviewers)' },
        },
        required: ['round', 'score'],
      },
    }).catch(() => {})
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
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'off' || arg === 'on') {
      await $.store.set('autoOpen', arg === 'on')
      return { text: arg === 'off' ? 'The pane will no longer open by itself. /ruthless-pane still opens it.' : 'The pane will open by itself again.' }
    }
    if (arg) return { text: 'Usage: /ruthless-pane (open it now) · /ruthless-pane off · /ruthless-pane on' }
    try {
      const r: any = await $.ui.open({ id: PANE, title: TITLE })
      return { text: r?.isPlaced === false ? 'Not enough room to dock the pane. Widen the terminal (about 144 columns) and run /ruthless-pane again.' : 'Ruthless Claude pane opened.' }
    } catch {
      return { text: 'Could not open the Ruthless Claude pane here.' }
    }
  })

  // the skill reports each review round; the pane draws it as pips + a score bar
  on('tool.call', { tool: PROGRESS_TOOL }, async ($, e: any) => {
    const round = Math.max(1, Math.min(4, Math.round(Number(e.round) || 1)))
    const score = Math.max(0, Math.min(10, Number(e.score) || 0))
    ruthlessRun = true
    if (e.fast === true) fastRun = true
    if (curMode !== squeezeMode()) await setMode($, squeezeMode())
    hud.round = round
    hud.score = score
    return { result: `Pane updated: round ${round}, score ${score}/10.` }
  })

  on('command.run', { command: 'ruthless-help' }, async () => ({ text: HELP.join('\n') }))

  on('skill.prompt', async ($, e, next) => {
    if (e.skill.toLowerCase().includes('ruthless')) {
      ruthlessRun = true
      if (FAST_WORDS.test(skillArgs(e.text).trim())) fastRun = true
      await setMode($, squeezeMode())
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (RUTHLESS_WORDS.test(e.text) || /^\/ruthless-claude\b/.test(e.text)) {
      ruthlessRun = true
      if (FAST_WORDS.test(e.text.trim())) fastRun = true
      await setMode($, squeezeMode())
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // never hold up the person's prompt

  on('turn.start', async ($, e, next) => {
    if (e.agentId) activeAgents.add(e.agentId)
    else await setMode($, ruthlessRun ? squeezeMode() : 'typing')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) activeAgents.delete(e.agentId)
    if (!e.agentId && activeAgents.size === 0) {
      ruthlessRun = false
      fastRun = false
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
        <Raster key={STAGE} columns={cols} rows={H / 2} cells={stage(m, sceneFrame(), cols, hud)} />
      </Box>
    )
  })
}
