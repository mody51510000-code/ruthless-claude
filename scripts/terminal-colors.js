// Ruthless Claude's terminal colors: `node terminal-colors.js on` paints the terminal itself
// (background, text, cursor) black and white, as Ruthless Claude looks; `off` gives the terminal its own back.
// Only the gray shades of the 16 colors change, so errors stay red and diffs stay green and red.
// It writes the standard color sequences (OSC 4/10/11/12 and their resets) straight to the
// console, so it works in Windows Terminal, VS Code, iTerm2, kitty, GNOME Terminal and most others.
// A terminal that ignores them just stays as it was.
const fs = require('fs')

const ESC = '\x1b]'
const BEL = '\x07'
const PALETTE = { 0: '#000000', 7: '#d9d9d9', 8: '#5c5c5c', 15: '#ffffff' }

const on = () =>
  `${ESC}11;#000000${BEL}${ESC}10;#d9d9d9${BEL}${ESC}12;#ffffff${BEL}` +
  Object.entries(PALETTE).map(([i, c]) => `${ESC}4;${i};${c}${BEL}`).join('')
const off = () => `${ESC}104${BEL}${ESC}110${BEL}${ESC}111${BEL}${ESC}112${BEL}`

const text = process.argv[2] === 'off' ? off() : on()

// the console itself, not this process's stdout (which the caller may be reading).
// On Windows it must be the device path: a bare "CONOUT$" gets resolved against the current
// folder and creates a plain file there instead of reaching the console.
const target = process.platform === 'win32' ? '\\\\.\\CONOUT$' : '/dev/tty'
try {
  // 'r+' opens what exists and never creates a file
  const fd = fs.openSync(target, 'r+')
  fs.writeSync(fd, text)
  fs.closeSync(fd)
  console.log('ok')
} catch (err) {
  console.log(`no terminal to paint: ${err.message}`)
}
