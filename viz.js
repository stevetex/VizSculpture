const { RtAudio, RtAudioFormat, RtAudioApi } = require('audify');
const fft = require('fft-js').fft;
const fftUtil = require('fft-js').util;

const MIC_DEVICE_ID = -1; // -1 = system default; update to your mic device index

const useMic   = process.argv.includes('--mic');
const debugMode = process.argv.includes('--debug');
const gainArg   = process.argv.find(a => a.startsWith('--gain='));
const gainFactor = gainArg ? parseFloat(gainArg.split('=')[1]) : 1.0;
const inputMode = useMic ? 'Microphone' : 'Bluetooth Stream';

const SAMPLES = 512;

// 1. Configure Audio Input
const rtAudio = new RtAudio(process.platform === 'win32' ? RtAudioApi.WINDOWS_DS : RtAudioApi.UNSPECIFIED);

// On Linux/PulseAudio, BT A2DP sources appear as "bluez_source.<MAC>.a2dp_source".
// Falls back to the sole non-default input device if no keyword match is found.
function findBluetoothInputDevice() {
    const devices = rtAudio.getDevices();
    const inputDevices = devices.filter(d => d.inputChannels > 0);
    const btKeywords = ['bluez', 'bluetooth', 'handsfree', 'hands-free'];
    const btDevice = inputDevices.find(d =>
        btKeywords.some(kw => d.name.toLowerCase().includes(kw))
    );
    if (btDevice) return btDevice.id;
    const defaultId = rtAudio.getDefaultInputDevice();
    const nonDefault = inputDevices.filter(d => d.id !== defaultId);
    if (nonDefault.length === 1) return nonDefault[0].id;
    process.stderr.write('Warning: could not auto-detect Bluetooth device. Available input devices:\n');
    inputDevices.forEach(d => process.stderr.write(`  id=${d.id} "${d.name}"\n`));
    process.stderr.write('Falling back to default input device.\n');
    return defaultId;
}

let resolvedDeviceId;
if (useMic) {
    resolvedDeviceId = MIC_DEVICE_ID === -1 ? rtAudio.getDefaultInputDevice() : MIC_DEVICE_ID;
} else {
    resolvedDeviceId = findBluetoothInputDevice();
}

const deviceInfo   = rtAudio.getDevices().find(d => d.id === resolvedDeviceId);
const inputChannels = deviceInfo?.inputChannels ?? 1;
const sampleRate    = deviceInfo?.preferredSampleRate ?? 48000;

if (debugMode) process.stderr.write(`Opening device id=${resolvedDeviceId} channels=${inputChannels} rate=${sampleRate}\n`);
rtAudio.openStream(
    null,
    { deviceId: resolvedDeviceId, nChannels: inputChannels, firstChannel: 0 },
    RtAudioFormat.RTAUDIO_FLOAT32,
    sampleRate,
    SAMPLES,
    'VizSculpture',
    (pcm) => {
        // 2. Decode PCM and perform FFT — mix all channels down to mono
        const pcmData = [];
        for (let i = 0; i < SAMPLES; i++) {
            let sum = 0;
            for (let ch = 0; ch < inputChannels; ch++) {
                sum += pcm.readFloatLE((i * inputChannels + ch) * 4);
            }
            pcmData[i] = (sum / inputChannels) * gainFactor;
        }

        const phasors = fft(pcmData);
        const magnitudes = fftUtil.fftMag(phasors);

        if (debugMode) {
            const rawMax = Math.max(...Array.from({ length: pcm.length }, (_, i) => Math.abs(pcm[i])));
            const maxPcm = Math.max(...pcmData.map(Math.abs));
            const maxMag = Math.max(...magnitudes);
            const peakDb = 20 * Math.log10(Math.max(maxMag / (SAMPLES / 2), 1e-10));
            const firstFloats = Array.from({ length: 4 }, (_, i) => pcm.readFloatLE(i * 4).toExponential(2)).join(', ');
            process.stderr.write(`buf=${pcm.length}B raw=${rawMax} floats=[${firstFloats}] pcm=${maxPcm.toFixed(7)} db=${peakDb.toFixed(1)}\n`);
        }

        // 3. Render to Console
        renderVisualizer(magnitudes);
    }
);

const MIN_DB = process.argv.includes('--debug') ? -120 : -60;
const MAX_DB = 0;

const FREQ_MIN = 40;    // Hz — sub-bass
const FREQ_MAX = 16000; // Hz — upper treble

function renderVisualizer(magnitudes) {
    const termWidth = process.stdout.columns || 80;
    const numBars = 10;
    const maxBar = termWidth - 12;
    const freqPerBin = sampleRate / SAMPLES;
    const logMin = Math.log2(FREQ_MIN);
    const logMax = Math.log2(FREQ_MAX);

    process.stdout.write('\x1B[2J\x1B[0f'); // Clear terminal screen
    console.log(`--- Console FFT Visualizer [${inputMode}] ---`);

    for (let i = 0; i < numBars; i++) {
        const fLow  = Math.pow(2, logMin + (i / numBars) * (logMax - logMin));
        const fHigh = Math.pow(2, logMin + ((i + 1) / numBars) * (logMax - logMin));
        const binLow  = Math.max(1, Math.round(fLow  / freqPerBin));
        const binHigh = Math.min(magnitudes.length - 1, Math.round(fHigh / freqPerBin));

        // Average magnitude across all bins in this band
        let sum = 0;
        for (let b = binLow; b <= binHigh; b++) sum += magnitudes[b];
        const mag = sum / Math.max(1, binHigh - binLow + 1);

        const db = 20 * Math.log10(Math.max(mag / (SAMPLES / 2), 1e-10));
        const normalized = Math.max(0, (db - MIN_DB) / (MAX_DB - MIN_DB));
        const barLength = Math.floor(normalized * maxBar);
        const bar = '█'.repeat(barLength);
        console.log(`${Math.round(fLow).toString().padStart(5)}Hz: ${bar}`);
    }
}

rtAudio.start();
