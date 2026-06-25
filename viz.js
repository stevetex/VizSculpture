const naudiodon = require('naudiodon');
const fft = require('fft-js').fft;
const fftUtil = require('fft-js').util;

// 1. Configure the Microphone
const micInputStream = new naudiodon.AudioIO({
    inOptions: {
        channelCount: 1,
        sampleFormat: naudiodon.SampleFormat16Bit,
        sampleRate: 16000
    }
});

// 2. Setup Data Buffers
// FFT-js requires a power-of-2 length (e.g., 512, 1024)
const SAMPLES = 512; 
let buffer = Buffer.alloc(0);

micInputStream.on('data', (data) => {
    // Append incoming chunks to our buffer
    buffer = Buffer.concat([buffer, data]);

    // Once we have enough samples for one FFT window
    while (buffer.length >= SAMPLES * 2) { // *2 because 16-bit samples are 2 bytes
        const pcmData = [];

        for (let i = 0; i < SAMPLES; i++) {
            // Read 16-bit signed integer and normalize to [-1, 1]
            pcmData[i] = buffer.readInt16LE(i * 2) / 32768.0;
        }

        // 3. Perform FFT
        const phasors = fft(pcmData);
        const magnitudes = fftUtil.fftMag(phasors);

        // 4. Render to Console
        renderVisualizer(magnitudes);

        // Clear buffer for the next window
        buffer = buffer.slice(SAMPLES * 2);
    }
});

function renderVisualizer(magnitudes) {
    const termWidth = process.stdout.columns || 80;
    const numBars = 10; // Number of bars to show
    const step = Math.floor(magnitudes.length / numBars / 2); // Show lower half (audible range)
    
    process.stdout.write('\x1B[2J\x1B[0f'); // Clear terminal screen
    console.log("--- Console FFT Visualizer (Speak into Mic) ---");

    for (let i = 0; i < numBars; i++) {
        const mag = magnitudes[i * step];
        const barLength = Math.max(0, Math.min(Math.floor(mag * 10), termWidth - 10));
        const bar = '█'.repeat(barLength);
        const freq = Math.round(i * step * 16000 / SAMPLES);
        console.log(`${freq.toString().padStart(5)}Hz: ${bar}`);
    }
}

micInputStream.start();
