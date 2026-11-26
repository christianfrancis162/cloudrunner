// Cloudrunner — audio: procedural WebAudio only, no audio files.
// One job: engine hum, wind, and the event sounds (chime, thud, crash).
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  // Build the graph lazily on the first user gesture (browsers block audio
  // before one) and keep it running; levels are driven every frame.
  function ensure() {
    if (ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    // Engine: two detuned sawtooths through a low-pass, pitch follows rpm.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 58;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();
    // Wind: looped noise through a band-pass; louder and higher with speed.
    const noiseLength = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i += 1) data[i] = Math.random() * 2 - 1;
    windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();
    started = true;
  }

  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  // Per-frame levels: engine pitch/volume follow throttle, wind follows speed.
  function update(state) {
    if (!started) return;
    const t = ctx.currentTime;
    const rpm = 50 + state.throttle * 90;
    engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    engineGain.gain.setTargetAtTime(state.engineOn ? 0.05 + state.throttle * 0.075 : 0.012, t, 0.1);
    const windLevel = Math.min(0.16, state.speed * 0.0016);
    windGain.gain.setTargetAtTime(state.airborne ? windLevel : windLevel * 0.3, t, 0.15);
    windFilter.frequency.setTargetAtTime(500 + state.speed * 9, t, 0.15);
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function ringChime() {
    resume();
    tone(880, 0.35, 'sine', 0.22);
    tone(1318, 0.5, 'sine', 0.18, 0.09);
  }

  function touchdownThud() {
    resume();
    tone(70, 0.25, 'sine', 0.4);
    tone(140, 0.18, 'triangle', 0.2, 0.02);
  }

  function crashNoise() {
    resume();
    if (!ctx) return;
    const dur = 0.8;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    tone(55, 0.7, 'sine', 0.35);
  }

  function lowFuelBeep() {
    resume();
    tone(660, 0.12, 'square', 0.1);
    tone(660, 0.12, 'square', 0.1, 0.18);
  }

  function toggleMute() {
    muted = !muted;
    if (ctx) {
      if (muted) ctx.suspend();
      else ctx.resume();
    }
    return muted;
  }

  return { resume, update, ringChime, touchdownThud, crashNoise, lowFuelBeep, toggleMute, isMuted: () => muted };
}
