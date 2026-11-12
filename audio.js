'use strict';
// Signaltöne über die Web Audio API. Töne werden auf der Audio-Uhr vorausgeplant,
// damit sie auch dann exakt sitzen, wenn der Browser JavaScript-Ticks verzögert.
const Sound = (() => {
  let ctx = null;
  let master = null;
  let volume = 1;
  let muted = false;
  const live = new Set();
  const log = []; // {in: Sekunden bis zum Ton, kind} – nur zur Kontrolle

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyVolume();
    return ctx;
  }

  function applyVolume() {
    if (master) master.gain.value = muted ? 0 : volume;
  }

  // Muss aus einem Tipp heraus aufgerufen werden (iOS gibt Audio sonst nicht frei).
  async function unlock() {
    // iOS 17+: Töne auch bei aktivem Stummschalter abspielen.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    const c = ensure();
    if (!c) return;
    if (c.state !== 'running') { try { await c.resume(); } catch (e) {} }
    try {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
    } catch (e) {}
  }

  async function resume() {
    if (ctx && ctx.state !== 'running') { try { await ctx.resume(); } catch (e) {} }
  }

  function tone(delay, freq, dur, gain) {
    if (!ctx) return;
    const at = ctx.currentTime + Math.max(0, delay);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.setValueAtTime(gain, at + dur - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    const node = { osc, g };
    live.add(node);
    osc.onended = () => { live.delete(node); try { g.disconnect(); } catch (e) {} };
  }

  // Signal für den Beginn einer Phase bzw. das Ende des Workouts.
  function cue(kind, delay) {
    if (!ensure()) return;
    log.push({ in: Math.round(delay * 100) / 100, kind });
    if (kind === 'beep') tone(delay, 880, 0.13, 0.5);
    else if (kind === 'work') tone(delay, 1320, 0.6, 0.6);
    else if (kind === 'rest' || kind === 'roundrest') tone(delay, 587, 0.6, 0.6);
    else if (kind === 'done') {
      tone(delay, 784, 0.18, 0.55);
      tone(delay + 0.2, 988, 0.18, 0.55);
      tone(delay + 0.4, 1175, 0.7, 0.6);
    }
  }

  // Plant für die laufende Phase die Countdown-Pieptöne (3, 2, 1) und das Signal
  // der Folgephase ('done' = Workout zu Ende).
  function schedulePhase(remaining, nextKind) {
    for (const n of [3, 2, 1]) {
      if (remaining > n + 0.05) cue('beep', remaining - n);
    }
    cue(nextKind, remaining);
  }

  function cancel() {
    for (const { osc, g } of live) {
      try { osc.onended = null; osc.stop(); } catch (e) {}
      try { g.disconnect(); } catch (e) {}
    }
    live.clear();
  }

  function configure(s) {
    volume = Math.min(1, Math.max(0, Number(s.volume)));
    if (!Number.isFinite(volume)) volume = 1;
    muted = !!s.muted;
    applyVolume();
  }

  async function test() {
    await unlock();
    cancel();
    schedulePhase(3.2, 'work');
  }

  return { unlock, resume, cue, schedulePhase, cancel, configure, test, log };
})();
