const i2c = require('i2c-bus');
const Pca9685Driver = require('pca9685').Pca9685Driver;

const options = {
    i2c: i2c.openSync(1),
    address: 0x40,
    frequency: 50,
    debug: false
};

// Configuration
const CHANNELS = 1;                     // Number of servos to control (1-10)
const POSITIONS = 10;                   // Number of positions to move through (0-10)
const PULSE = [500, 2500];              // Pulse length for max reverse and max forward
const INTERVAL360 = 2500;               // milliseconds to spin 360 degrees
const LOOP_INTERVAL = INTERVAL360 / 10; // Milliseconds for main timer loop ()
const STOP_CYCLE = 0.07558;             // Duty cycle to stop the servo (7.5% for 1500us pulse)

let fwdDirection = true;
let sweepTimer = null;
let servosRunning = [false, false, false, false, false, false, false, false, false, false];
let servoPositions = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // Track current position of each servo

const pwm = new Pca9685Driver(options, function(err) {
    if (err) {
        console.error("Error initializing PCA9685", err);
        return;
    }
    initExit();
    mainLoop();
});

function allServosDone() {
    return servosRunning.every(status => status === false);
}

function startServo(channel, time, direction) {
    servosRunning[channel] = true;
    fwdDirection ? pulseLen = PULSE[1] : pulseLen = PULSE[0];
    console.log("Setting pulse length to " + pulseLen);
    pwm.setPulseLength(channel, pulseLen, 0, () => {
        servoPositions[channel] = pulseLen;
        timer = setInterval(() => {
            clearInterval(timer);
            stopServo(channel);
        }, time);
    });        
}

function stopServo(channel) {
    pwm.setDutyCycle(channel, STOP_CYCLE, 0, function (err) { 
        if (err) {
            console.error("Error stopping servo " + channel, err);
        }
        servosRunning[channel] = false;
    });
}

function setServoPosition(channel, position) {
    console.log("Setting servo " + channel + " to position " + position + " from " + servoPositions[channel]);
    if (position < 0 || position >= POSITIONS) {
        console.error("Position " + position + " is out of range for channel " + channel);
        return;
    } else if (position != servoPositions[channel]) {
        let deltaPos = postition - servoPositions[channel];
        let time = Math.abs(deltaPos) * (INTERVAL360 / POSITIONS);
        startServo(chennel, time, deltaPos > 0);
        servoPositions[channel] = position;
    }
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

function mainLoop() {
    console.log("Movement loop started. Press Ctrl+C to stop.");
    // Start the movement loop
    sweepTimer = setInterval(() => {
        if (allServosDone()) {
            for (let i=0; i<CHANNELS; i++) {
                startServo(i, INTERVAL360, fwdDirection);
            }
            fwdDirection = !fwdDirection; // Reverse direction for next sweep
        }
    }, LOOP_INTERVAL);
}