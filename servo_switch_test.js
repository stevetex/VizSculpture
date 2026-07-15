const i2c = require('i2c-bus');
const Pca9685Driver = require('pca9685').Pca9685Driver;
const pigpio = require('pigpio-client').pigpio({ host: 'localhost' });

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

let buttonsConnected = false;

// servo configuration

const options = {
    i2c: i2c.openSync(1),
    address: 0x40,
    frequency: 50,
    debug: false
};

const CHANNELS = 1;     // Number of servos to control (1-10)
const MIN_PULSE = 500;  // 0 degrees (typical)
const MAX_PULSE = 2500; // 360 degrees
const STEP_SIZE = 50;   // How many uS to move per tick
const POLL_INTERVAL = 10; // How often to check if a servo has stopped (ms)
const PULSE = [2500, 500];              // Pulse length for max reverse and max forward
const INTERVAL360 = [1340, 1370];       // milliseconds to spin 360 degrees backward,forward
const LOOP_INTERVAL = [INTERVAL360[0] / 10, INTERVAL360[1] / 10]; // Milliseconds for main timer loop ()

let currentPulse = MIN_PULSE;
let fwdDirection = true;
let sweepTimer = null;
let driverConnected = false;

class ServoState {
    constructor(running, position) {
        this.running = running;
        this.position = position;
    }
}

let servos = [new ServoState(false, 0), new ServoState(false, 0), new ServoState(false, 0), new ServoState(false, 0), new ServoState(false, 0), new ServoState(false, 0), new ServoState(false, 0), new ServoState(false, 0), new ServoState(false, 0), new ServoState(false, 0)];

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
    const pulseLen = fwdDirection ? PULSE[1] : PULSE[0];
    console.log("Setting pulse length to " + pulseLen);
    const start = process.hrtime.bigint();
    pwm.setPulseLength(channel, pulseLen, 0, () => {
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // ms
        const remaining = Math.max(0, time - elapsed);
        setTimeout(() => stopServo(channel), remaining);
    });
}

function stopServo(channel) {
    pwm.setDutyCycle(channel, 0.07558, 0, function (err) { // 7.5% duty cycle = 1500us
        if (err) {
            console.error("Error stopping servo " + channel, err);
        }
        servos[channel].running = false;
    });
}

function initExit() {
    // Graceful exit: Turn off the PWM signal when user presses Ctrl+C
    process.on('SIGINT', () => {
        console.log("\nStopping servos...");
        stopServo(0);
        clearInterval(sweepTimer);
        setTimeout(() => {
            pwm.allChannelsOff();
            process.exit();
        }, 100); // Small delay to ensure stop command is sent before process dies
    });
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
  buttonsConnected = true;
});

pigpio.once('error', (err) => {
  console.error('pigpio error:', err);
});

// servo/switch interaction

let rotationTimer = 0;

function waitForConnections() {
    return new Promise((resolve) => {
        const checkTimer = setInterval(() => {
            if (buttonsConnected && driverConnected) {
                clearInterval(checkTimer);
                resolve();
            }
        }, POLL_INTERVAL);
    });
}

function switchFlipped(index) {
    console.log(`Switch ${index} flipped. State: ${switches[index].open ? 'OPEN' : 'CLOSED'}`);
    if (servos[index].position > 0) {
        stopServo(index);
        servos[index].position = 0;
    }
    rotationTimer = (performance.now() - rotationTimer) * 1000; // Convert to seconds
    console.log(`Servo spin time: ${rotationTimer.toFixed(4)} sec`);
}

console.log("Servo starting. Press Ctrl+C to stop.");
(async () => {
    await waitForConnections();
    // Start the movement
    servos[0].position = 1;
    rotationTimer = performance.now();
    await waitStartServo(0, INTERVAL360[+fwdDirection], fwdDirection);
})();
