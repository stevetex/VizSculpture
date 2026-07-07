const Gpio = require('pigpio').Gpio;

const pins = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const reeds = pins.map(pin => {
  const reed = new Gpio(pin, {
    mode: Gpio.INPUT,
    pullUpDown: Gpio.PUD_UP,
    alert: true
  });

  // Debounce: ignore glitches shorter than 50ms
  reed.glitchFilter(50000);

  reed.on('alert', (level) => {
    console.log(`GPIO ${pin}: ${level === 0 ? 'CLOSED' : 'OPEN'}`);
  });

  return reed;
});

// Clean up on exit
process.on('SIGINT', () => {
  reeds.forEach(r => r.disableAlert());
  process.exit();
});