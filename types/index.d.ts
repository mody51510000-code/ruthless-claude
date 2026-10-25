export type Mode = 'idle' | 'typing' | 'squeeze' | 'press' | 'revenge' | 'breakout'

// Ruthless mode: the terminal becomes Ruthless Claude's console until /ruthless-mode off
export type Console = {
  on: boolean
  kind: 'make' | 'review' // what each prompt is sent as
  fast: boolean
  compare: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'ruthless-claude': {
      mode: Shaped<Mode>
      console: Shaped<Console>
    }
  }
}
