const pigpio = require('pigpio-client').pigpio({ host: 'localhost' });
const readline = require('readline');

// reed switch configuration

class ReedSwitch {
  constructor(pin, phys_pin, open) {
    this.pin = pin;
    this.phys_pin = phys_pin;
    this.open = open;
  }
}

let switches = [
    new ReedSwitch(4, 7, true),
    new ReedSwitch(5, 29, true),
    new ReedSwitch(6, 31, true),
    new ReedSwitch(7, 26, true),
    new ReedSwitch(8, 24, true),
    new ReedSwitch(9, 21, true),
    new ReedSwitch(10, 19, true),
    new ReedSwitch(11, 23, true),
    new ReedSwitch(12, 32, true),
    new ReedSwitch(13, 33, true)
];

// live display

let drawn = false;

function stateText(sw) {
  return sw.open ? 'OPEN  ' : 'CLOSED';
}

function drawTable() {
  const lines = [];
  lines.push('  Switch    State');
  lines.push('  ------    -----');
  for (const sw of switches) {
    lines.push(`  GPIO ${String(sw.pin).padEnd(2)}   ${stateText(sw)}`);
  }
  lines.push('');
  lines.push("  Press 'x' or ESC to quit.");
  process.stdout.write(lines.join('\n') + '\n');
  drawn = true;
}

function updateRow(index) {
  if (!drawn) return;
  // Row 0 of switches sits 2 lines below the top of the table block.
  // Move cursor up from the bottom (after the quit line) to the target row,
  // rewrite it, then restore.
  const totalLines = switches.length + 4; // header(2) + rows + blank + prompt
  const rowFromTop = 2 + index;           // 0-based line of this switch
  const up = totalLines - rowFromTop;
  const sw = switches[index];
  const text = `  GPIO ${String(sw.pin).padEnd(2)}   ${stateText(sw)}`;
  process.stdout.write(`\x1b[${up}A\r\x1b[2K${text}\x1b[${up}B\r`);
}

// switch implementation

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

pigpio.once('connected', async () => {
  for (let i = 0; i < switches.length; i++) {
    try {
      const reed = pigpio.gpio(switches[i].pin);
      await reed.modeSet('input');
      await reed.pullUpDown(2); // PUD_UP
      await reed.glitchSet(5000); // 5ms debounce for contact bounce (only filters notifications, not reads)

      const level = await reed.read();
      switches[i].open = level === 1;

      reed.notify((level, tick) => {
        switches[i].open = level === 1;
        updateRow(i);
      });
    } catch (err) {
      console.error(`GPIO ${switches[i].pin}: setup failed:`, err);
    }
  }
  drawTable();
});

pigpio.once('error', (err) => {
  console.error('pigpio error:', err);
});

// keyboard control

function shutdown() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdout.write('\n');
  process.exit();
}

function startKeyboardControl() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.on('keypress', (str, key) => {
    if (str === 'x' || key.name === 'escape' || (key.ctrl && key.name === 'c')) {
      shutdown();
    }
  });
}

startKeyboardControl();
