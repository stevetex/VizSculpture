const pigpio = require('pigpio-client').pigpio({ host: 'localhost' });

const pins = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

pigpio.once('connected', async () => {
  console.log('Connected to pigpiod');

  for (const pin of pins) {
    try {
      const reed = pigpio.gpio(pin);
      await reed.modeSet('input');
      await reed.pullUpDown(2); // PUD_UP
      await reed.glitchSet(5000); // 5ms debounce for contact bounce (only filters notifications, not reads)

      const level = await reed.read();
      console.log(`GPIO ${pin}: initial level = ${level}`);

      reed.notify((level, tick) => {
        console.log(`GPIO ${pin}: ${level === 0 ? 'CLOSED' : 'OPEN'}`);
      });
      console.log(`GPIO ${pin}: notify registered`);
    } catch (err) {
      console.error(`GPIO ${pin}: setup failed:`, err);
    }
  }
});

pigpio.once('error', (err) => {
  console.error('pigpio error:', err);
});