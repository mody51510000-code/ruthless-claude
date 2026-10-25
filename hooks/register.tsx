import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import type { Console, Mode } from '../types'
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
// Claude's revenge: round 1 already scored 9+, so nothing needed squeezing.
// It plays to the end even if the turn finishes first, then the pane goes back to idle.
const REVENGE_SCORE = 9
const REVENGE_HOLD = 80 // frames (8 s) the scene runs before it may give way to idle
const isRevenge = (m: Mode) => m === 'revenge' || m === 'breakout'
let idleAfterRevenge = false // the turn is over; go idle once the scene has played

function startClock($: any) {
  if (timer) return
  timer = $.clock.every(100, () => {
    tick = (tick + 1) % 100000
    if (idleAfterRevenge && sceneFrame() >= REVENGE_HOLD) void setMode($, 'idle').catch(() => {})
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
  if (!isRevenge(m)) idleAfterRevenge = false
  if (m !== curMode) {
    modeStart = tick
    if (m !== 'typing') { hud.round = 0; hud.score = 0 } // a fresh squeeze starts empty
  }
  curMode = m
  await update($, mode, () => m)
}

// ============ Ruthless mode: the terminal as Ruthless Claude's console ============
const CONSOLE_OFF: Console = { on: false, kind: 'make', fast: false, compare: false }
const consoleState = atom({ plugin: 'ruthless-claude', key: 'console' } as const, CONSOLE_OFF, { shape: 'console-1' })
// Ruthless Claude's look: pitch black with white eyes, so the console is black and white
const EYES = '▀▄▀'
const INK = 'white'
const STATUS = `${EYES} RUTHLESS MODE · /ruthless-mode off for normal Claude`

// every change is kept in the store too, so the mode survives a restart
async function setConsole($: any, fn: (c: Console) => Console) {
  const was = (await read($, consoleState)).on
  const c = await update($, consoleState, fn)
  await $.store.set('console', c)
  $.ui.status(c.on ? STATUS : undefined)
  if (c.on !== was) {
    await ruthlessTheme($, c.on)
    await paintTerminal($, c.on)
  }
  return c
}

// the terminal itself (background, text, cursor, its 16 colors): scripts/terminal-colors.js
// writes the standard color sequences to the console; a terminal that ignores them stays as it was
async function paintTerminal($: any, on: boolean) {
  try {
    const sep = $.plugin.root.includes('\\') ? '\\' : '/'
    await $.process.run(['node', `${$.plugin.root}${sep}scripts${sep}terminal-colors.js`, on ? 'on' : 'off'], { timeoutMs: 5000 })
  } catch { /* no node, or no terminal: the colors are a nice-to-have */ }
}

// the plugin's own black-and-white theme (themes/ruthless.json) while the mode is on; the person's own after
const THEME_GUESSES = ['ruthless-claude:ruthless', 'custom:ruthless-claude:ruthless', 'custom:ruthless']
async function ruthlessTheme($: any, on: boolean) {
  try {
    const row = ((await $.config.list()) as any[]).find(r => r.key === 'theme')
    if (!row || row.isLocked) return
    const isOurs = (v: unknown) => /ruthless/i.test(String(v ?? ''))
    if (on) {
      if (isOurs(row.value)) return
      const choices: string[] = row.options?.filter(isOurs) ?? []
      for (const value of choices.length ? choices : THEME_GUESSES) {
        const r = await $.config.set({ key: 'theme', value }).catch(() => ({ deny: 'no' }))
        if (!r.deny) { await $.store.set('themeBefore', row.value); return }
      }
    } else {
      const before = await $.store.get('themeBefore')
      if (before !== undefined && isOurs(row.value)) await $.config.set({ key: 'theme', value: before })
      await $.store.set('themeBefore', undefined)
    }
  } catch { /* the theme is a nice-to-have */ }
}

// what a prompt typed in Ruthless mode becomes: the skill's own trigger phrase and flags
export function ruthlessPrompt(text: string, c: Console): string {
  const t = text.trim()
  const flags = `${c.fast ? ' --fast' : ''}${c.compare ? ' --compare' : ''}`
  return c.kind === 'review'
    ? `/ruthless-claude review ${t || 'my uncommitted changes'}${flags}`
    : `/ruthless-claude ${t}${flags}`
}

// the words the person typed, without the wrapper Ruthless mode put around them
export function typedText(text: string): string {
  const m = /^\/ruthless-claude\s+(?:review\s+)?([\s\S]*?)(?:\s+--fast)?(?:\s+--compare)?\s*$/.exec(text.trim())
  return m ? m[1]! : text
}
const WORKING = ['Squeezing', 'Crushing', 'Grinding', 'Interrogating', 'Wringing', 'Tearing apart', 'Showing no mercy']
const DONE = ['Squeezed', 'Crushed', 'Ground down', 'Wrung out', 'Broke it in']
// the same engine word always maps to the same Ruthless word, so it doesn't flicker
const pick = (list: string[], seed: string) => list[[...seed].reduce((a, ch) => a + ch.charCodeAt(0), 0) % list.length]!

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
  '  /ruthless-mode                     Ruthless mode: the terminal becomes its console, everything you type is squeezed',
  '  /ruthless-mode off                 back to normal Claude',
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
    await $.command.register({ name: 'ruthless-mode', description: 'Ruthless mode: the terminal becomes Ruthless Claude\'s console (off: back to normal Claude)' })
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
    // Ruthless mode stays on across sessions until it is turned off
    const kept = (await $.store.get('console')) as Console | undefined
    if (kept?.on) {
      await setConsole($, () => ({ ...CONSOLE_OFF, ...kept }))
      await paintTerminal($, true) // a new terminal window starts in its own colors
    }
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
    const revenge = round === 1 && score >= REVENGE_SCORE
    const next: Mode = revenge ? (fastRun ? 'breakout' : 'revenge') : squeezeMode()
    if (curMode !== next && !isRevenge(curMode)) await setMode($, next)
    hud.round = round
    hud.score = score
    return { result: `Pane updated: round ${round}, score ${score}/10.${revenge ? " Claude's revenge plays: the first draft needed no squeezing." : ''}` }
  })

  on('command.run', { command: 'ruthless-help' }, async () => ({ text: HELP.join('\n') }))

  // /ruthless-mode       the terminal becomes Ruthless Claude's console
  // /ruthless-mode off   back to normal Claude
  on('command.run', { command: 'ruthless-mode' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'off' || arg === 'normal') {
      await setConsole($, c => ({ ...c, on: false }))
      return { text: 'Back to normal Claude. /ruthless-mode brings Ruthless mode back.' }
    }
    if (arg && arg !== 'on') return { text: 'Usage: /ruthless-mode (turn it on) · /ruthless-mode off (back to normal Claude)' }
    await setConsole($, c => ({ ...c, on: true }))
    void $.ui.open({ id: PANE, title: TITLE }).catch(() => {})
    return { text: 'Ruthless mode on: everything you type now goes to Ruthless Claude. Use the bar above the prompt to switch Squeeze/Review, Fast and Compare. /ruthless-mode off goes back to normal Claude.' }
  })

  // the console's bar above the prompt: the mode, its switches, and the way back
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, consoleState)
    if (!c.on || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const set = (fn: (c: Console) => Console) => () => { void setConsole($, fn).catch(() => {}) }
    const mark = (b: boolean) => (b ? '●' : '○')
    return (
      <Box flexDirection="column" borderStyle="double" borderColor={INK} paddingX={1}>
        <Box>
          <Text color={INK} bold>{EYES}  R U T H L E S S   C L A U D E  </Text>
          <Text dimColor>no mercy until 9/10 · </Text>
          <Text color={INK}>{c.kind === 'review' ? 'reviewing your code' : 'squeezing your task'}{c.fast ? ' · fast' : ''}{c.compare ? ' · compare' : ''}</Text>
        </Box>
        <Box>
          <Button key="make" hotkey="1" plain label={`${mark(c.kind === 'make')} Squeeze a task`} onPress={set(x => ({ ...x, kind: 'make' }))} />
          <Text>  </Text>
          <Button key="review" hotkey="2" plain label={`${mark(c.kind === 'review')} Review code`} onPress={set(x => ({ ...x, kind: 'review' }))} />
          <Text>  </Text>
          <Button key="fast" hotkey="3" plain label={`${mark(c.fast)} Fast`} onPress={set(x => ({ ...x, fast: !x.fast }))} />
          <Text>  </Text>
          <Button key="compare" hotkey="4" plain label={`${mark(c.compare)} Compare`} onPress={set(x => ({ ...x, compare: !x.compare }))} />
          <Text>  </Text>
          <Button key="pane" hotkey="5" plain label="Pane" onPress={() => { void $.ui.open({ id: PANE, title: TITLE }).catch(() => {}) }} />
          <Text>  </Text>
          <Button key="help" hotkey="6" plain label="Help" onPress={() => { for (const line of HELP) $.ui.log(line) }} />
          <Text>  </Text>
          <Button key="normal" hotkey="x" plain role="dismiss" label="Normal Claude" onPress={set(x => ({ ...x, on: false }))} />
        </Box>
      </Box>
    )
  })

  // ---- the rest of the terminal, dressed as Ruthless Claude's own app while the mode is on ----

  // your prompts: "▀▄▀ you ›" and the words you typed (not the /ruthless-claude wrapper)
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const c = await read($, consoleState)
    if (!c.on || e.props.isExpanded || e.props.origin.kind !== 'composer') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text color={INK} bold>{EYES} you › </Text>
        <Text>{typedText(e.props.text)}</Text>
      </Box>
    )
  })

  // Claude's replies: a white bar down the side and a "RUTHLESS" head on each reply
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const c = await read($, consoleState)
    if (!c.on) return next(e)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="quote" borderColor={INK} paddingLeft={1}>
        {e.props.isFirstOfReply ? <Text color={INK} bold>{EYES} RUTHLESS</Text> : null}
        <Markdown text={e.props.text} dimColor={e.props.isSummary ? true : undefined} />
      </Box>
    )
  })

  // the spinner and the closing line speak Ruthless
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const c = await read($, consoleState)
    if (!c.on) return next(e)
    return next({ ...e, props: { ...e.props, word: pick(WORKING, e.props.word) } })
  })
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const c = await read($, consoleState)
    if (!c.on) return next(e)
    return next({ ...e, props: { ...e.props, word: pick(DONE, e.props.word) } })
  })

  // the hint under the prompt keeps its own line and adds the way back
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const c = await read($, consoleState)
    if (!c.on) return next(e)
    return next({ ...e, props: { ...e.props, tail: `${EYES} ruthless mode · /ruthless-mode off: normal Claude` } })
  })

  on('skill.prompt', async ($, e, next) => {
    if (e.skill.toLowerCase().includes('ruthless')) {
      ruthlessRun = true
      if (FAST_WORDS.test(skillArgs(e.text).trim())) fastRun = true
      await setMode($, squeezeMode())
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Ruthless mode: a plain prompt (not a slash command, not empty) goes to Ruthless Claude
    const c = await read($, consoleState)
    if (c.on && e.text.trim() && !e.text.trim().startsWith('/')) e = { ...e, text: ruthlessPrompt(e.text, c) }
    if (RUTHLESS_WORDS.test(e.text) || /^\/ruthless-claude\b/.test(e.text)) {
      ruthlessRun = true
      if (FAST_WORDS.test(e.text.trim())) fastRun = true
      await setMode($, squeezeMode())
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // never hold up the person's prompt

  on('turn.start', async ($, e, next) => {
    if (e.agentId) activeAgents.add(e.agentId)
    else if (!(isRevenge(curMode) && !idleAfterRevenge)) await setMode($, ruthlessRun ? squeezeMode() : 'typing') // never cut the revenge short mid-run
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) activeAgents.delete(e.agentId)
    if (!e.agentId && activeAgents.size === 0) {
      ruthlessRun = false
      fastRun = false
      if (isRevenge(curMode)) idleAfterRevenge = true // let it finish; the clock goes idle after
      else await setMode($, 'idle')
    }
    return result
  })

  on('session.end', async ($, e, next) => {
    stopClock()
    // leave the terminal in its own colors once Claude exits
    if ((await read($, consoleState)).on) await paintTerminal($, false)
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
