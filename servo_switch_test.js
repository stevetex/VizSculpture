const i2c = require('i2c-bus');
const Pca9685Driver = require('pca9685').Pca9685Driver;
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

let switchesConnected = false;

// servo configuration

const options = {
    i2c: i2c.openSync(1),
    address: 0x40,
    frequency: 50,
    debug: false
};

const POLL_INTERVAL = 10; // How often to check if a servo has stopped (ms)
const PULSE = [500, 2500];              // Pulse length for max reverse and max forward
const INTERVAL_MAX = [2000, 1340];      // max milliseconds to spin motor backward,forward
const UP = true;
const DOWN = false;

let currentPulse = PULSE[0];
let motorDirection = UP;
let sweepTimer = null;
let driverConnected = false;

class ServoState {
    constructor(running, direction, position) {
        this.running = running;
        this.direction = direction;
        this.position = position;
        this.timestamp = 0;
    }
}

let servos = [new ServoState(false, DOWN, 0), new ServoState(false, DOWN, 0), new ServoState(false, DOWN, 0), new ServoState(false, DOWN, 0), new ServoState(false, DOWN, 0), new ServoState(false, DOWN, 0), new ServoState(false, DOWN, 0), new ServoState(false, DOWN, 0), new ServoState(false, DOWN, 0), new ServoState(false, DOWN, 0)];

// servo implementation

const pwm = new Pca9685Driver(options, function(err) {
    if (err) {
        console.error("Error initializing PCA9685", err);
        return;
    }
    initExit();
    driverConnected = true;
});

function allServosDone() {
    return servos.every(servo => !servo.running);
}

function waitStartServo(channel, time, direction) {
    return new Promise((resolve) => {
        const waitTimer = setInterval(() => {
            if (!servos[channel].running) {
                clearInterval(waitTimer);
                startServo(channel, time, direction);
                resolve();
            }
        }, POLL_INTERVAL);
    });
}

function startServo(channel, time, direction) {
    servos[channel].running = true;
    const pulseLen = direction ? PULSE[1] : PULSE[0];
    console.log("Setting pulse length to " + pulseLen);
    const start = process.hrtime.bigint();
    servos[channel].timestamp = performance.now();
    servos[channel].direction = direction;
    pwm.setPulseLength(channel, pulseLen, 0, () => {
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // ms
        const remaining = Math.max(0, time - elapsed);
        setTimeout(() => stopServo(channel), remaining);
    });
}

function stopServo(channel) {
    pwm.setDutyCycle(channel, 0.07558, 0, function (err) { // 7.5% duty cycle = 1500us
        console.log(`Servo ${channel} stopped. Total run time: ${(performance.now() - servos[channel].timestamp).toFixed(4)} ms`);
        if (err) {
            console.error("Error stopping servo " + channel, err);
        }
        servos[channel].running = false;
    });
}

function shutdown() {
    console.log("\nStopping servos...");
    servos.forEach((servo, channel) => {
        if (servo.running) stopServo(channel);
    });
    clearInterval(sweepTimer);
    setTimeout(() => {
        pwm.allChannelsOff();
        process.exit();
    }, 100); // Small delay to ensure stop command is sent before process dies
}

function initExit() {
    // Graceful exit: Turn off the PWM signal when user presses Ctrl+C
    process.on('SIGINT', shutdown);
}

// switch implementation

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

pigpio.once('connected', async () => {
  console.log('Connected to pigpiod');
  for (let i = 0; i < switches.length; i++) {
    try {
      const reed = pigpio.gpio(switches[i].pin);
      await reed.modeSet('input');
      await reed.pullUpDown(2); // PUD_UP
      await reed.glitchSet(5000); // 5ms debounce for contact bounce (only filters notifications, not reads)

      const level = await reed.read();
      switches[i].open = level === 1;
      console.log(`GPIO ${switches[i].pin}: initial level = ${level}`);

      reed.notify((level, tick) => {
        switches[i].open = level === 1;
        switchFlipped(i);
      });
      console.log(`GPIO ${switches[i].pin}: notify registered`);
    } catch (err) {
      console.error(`GPIO ${switches[i].pin}: setup failed:`, err);
    }
  }
  switchesConnected = true;
});

pigpio.once('error', (err) => {
  console.error('pigpio error:', err);
});

// servo/switch interaction

function waitForConnections() {
    return new Promise((resolve) => {
        const checkTimer = setInterval(() => {
            if (switchesConnected && driverConnected) {
                clearInterval(checkTimer);
                resolve();
            }
        }, POLL_INTERVAL);
    });
}

function switchFlipped(index) {
    if (switchesConnected && driverConnected) {
        console.log(`Switch ${index} flipped. State: ${switches[index].open ? 'OPEN' : 'CLOSED'}`);
        if (!switches[index].open) {
            if ((servos[index].running) && (servos[index].direction == DOWN)) {
                stopServo(index);
            }
            servos[index].position = 0;
        }
    }
}

const SHIFTED_DIGITS = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0' };

function startKeyboardControl() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }
    process.stdin.on('keypress', async (str, key) => {
        if (str === 'x' || (key.ctrl && key.name === 'c')) {
            shutdown();
            return;
        }
        const shifted = str in SHIFTED_DIGITS;
        const digit = shifted ? SHIFTED_DIGITS[str] : str;
        if (digit && /^[0-9]$/.test(digit)) {
            const channel = Number(digit);
            const direction = shifted ? !motorDirection : motorDirection;
            servos[channel].position = 0;
            await waitStartServo(channel, INTERVAL_MAX[+direction], direction);
        }
    });
}

console.log("Servo ready. Press 0-9 to spin the matching servo (Shift+digit to reverse), x to quit.");
(async () => {
    await waitForConnections();
    startKeyboardControl();
})();
