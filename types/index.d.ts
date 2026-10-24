export type Mode = 'idle' | 'typing' | 'squeeze'

declare module 'claude-code' {
  interface PluginState {
    'ruthless-claude': {
      mode: Shaped<Mode>
    }
  }
}
