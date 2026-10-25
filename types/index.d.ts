export type Mode = 'idle' | 'typing' | 'squeeze' | 'press' | 'revenge' | 'breakout'

declare module 'claude-code' {
  interface PluginState {
    'ruthless-claude': {
      mode: Shaped<Mode>
    }
  }
}
