const Microphone = require('node-microphone');
const { fft, util: fftUtil } = require('fft-js');

// 1. Initialize Microphone (captures raw PCM data)
const mic = new Microphone({
  rate: 44100,
  channels: 1,
  device: 'plughw:1,0', // Optional: specify device
});

const micStream = mic.startRecording();

// 2. Process the audio stream in chunks
micStream.on('data', (buffer) => {
  // Convert buffer to a float array for FFT
  const samples = new Float32Array(buffer.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = buffer.readInt16LE(i * 2) / 32768; // Normalize 16-bit PCM
  }

  // 3. Perform FFT
  // Note: fft-js requires input length to be a power of 2 (e.g., 1024)
  if (samples.length >= 1024) {
    const phasors = fft(samples.slice(0, 1024));
    const magnitudes = fftUtil.fftMag(phasors);

    // 4. "Visualize" in Console (Similar to p5.js loop)
    console.clear();
    const barCount = 40; 
    for (let i = 0; i < barCount; i++) {
      const mag = magnitudes[i] * 100; // Scale for visibility
      console.log('█'.repeat(Math.min(mag, 50))); 
    }
  }
});

micStream.on('error', (err) => console.error(err));
