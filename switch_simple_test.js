const pigpio = require('pigpio-client').pigpio({ host: 'localhost' });

const PIN = 4; // whichever GPIO your test reed switch is on

pigpio.once('connected', () => {
  const reed = pigpio.gpio(PIN);
  reed.modeSet('input');
  reed.pullUpDown(2); // PUD_UP

  setInterval(() => {
    reed.read((err, level) => {
      if (err) console.error(err);
      else console.log(`GPIO ${PIN}: ${level}`);
    });
  }, 500);
});