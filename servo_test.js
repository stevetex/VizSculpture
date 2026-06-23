const i2c = require('i2c-bus');
const Pca9685Driver = require('pca9685').Pca9685Driver;

const options = {
    i2c: i2c.openSync(1),
    address: 0x40,
    frequency: 50,
    debug: false
};

// Configuration
const CHANNELS = 1;     // Number of servos to control (1-10)
const MIN_PULSE = 500;  // 0 degrees (typical)
const MAX_PULSE = 2500; // 360 degrees
const STEP_SIZE = 50;   // How many uS to move per tick
const INTERVAL = 20;    // Speed of movement (ms)

const PULSE = [500, 2500];              // Pulse length for max reverse and max forward
const INTERVAL360 = 2600;               // milliseconds to spin 360 degrees
const LOOP_INTERVAL = INTERVAL360 / 10; // Milliseconds for main timer loop ()

let currentPulse = MIN_PULSE;
let fwdDirection = true;
let sweepTimer = null;
let servosRunning = [false, false, false, false, false, false, false, false, false, false];

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
        timer = setInterval(() => {
            clearInterval(timer);
            stopServo(channel);
        }, time);
    });        
}

function stopServo(channel) {
    pwm.setDutyCycle(channel, 0.07558, 0, function (err) { // 7.5% duty cycle = 1500us
        if (err) {
            console.error("Error stopping servo " + channel, err);
        }
        servosRunning[channel] = false;
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

function mainLoop() {
    console.log("Sweep started. Press Ctrl+C to stop.");
    // Start the movement loop
    sweepTimer = setInterval(() => {
        if (allServosDone()) {
            startServo(0, INTERVAL360, fwdDirection);
            fwdDirection = !fwdDirection; // Reverse direction for next sweep
        }
    /*
            //for (let channel = 0; channel < CHANNELS; channel++) {
                pwm.setPulseLength(0, currentPulse);

                // Update pulse for next tick
                currentPulse += (STEP_SIZE * direction);

                // Reverse direction at limits
                if (currentPulse >= MAX_PULSE || currentPulse <= MIN_PULSE) {
                    direction *= -1;
                }
        //}*/
    }, LOOP_INTERVAL);
}