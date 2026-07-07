const pigpio = require('pigpio-client').pigpio({ host: 'localhost' });

const pins = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

pigpio.once('connected', async () => {
  console.log('Connected to pigpiod');

  for (const pin of pins) {
    const reed = pigpio.gpio(pin);
    await reed.modeSet('input');
    await reed.pullUpDown(2); // PUD_UP
    await reed.glitchSet(50000); // 50ms debounce

    reed.notify((level, tick) => {
      console.log(`GPIO ${pin}: ${level === 0 ? 'CLOSED' : 'OPEN'}`);
    });
  }
});

pigpio.once('error', (err) => {
  console.error('pigpio error:', err);
});