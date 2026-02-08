let song;
let fft;

function preload() {
  song = loadSound('song.mp3');
}

function setup() {
  createCanvas(256, 256);
  song.play();
  // Create FFT object to analyze sound
  fft = new p5.FFT();
}

function draw() {
  background(0);
  // Get frequency data
  let spectrum = fft.analyze();
  noStroke();
  fill(0, 255, 0); // Green color for bars
  
  // Visualize spectrum
  for (let i = 0; i < spectrum.length; i++) {
    let x = map(i, 0, spectrum.length, 0, width);
    let h = -height + map(spectrum[i], 0, 255, height, 0);
    rect(x, height, width / spectrum.length, h);
  }
}