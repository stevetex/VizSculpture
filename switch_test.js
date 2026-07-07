const pigpio = require('pigpio-client').pigpio({ host: 'localhost' });

const pins = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

pigpio.once('connected', () => {
  console.log('Connected to pigpiod');

  pins.forEach(pin => {
    const reed = pigpio.gpio(pin);
    reed.modeSet('input');
    reed.pullUpDown(2); // 2 = PUD_UP
    reed.glitchSet(50000); // 50ms debounce

    reed.notify((level, tick) => {
      console.log(`GPIO ${pin}: ${level === 0 ? 'CLOSED' : 'OPEN'}`);
    });
  });
});

pigpio.once('error', (err) => {
  console.error('pigpio error:', err);
});