'use strict';

const PREP = 5; // Sekunden Vorlauf vor der ersten Übung
const LS = { cur: 'it.current', list: 'it.workouts', set: 'it.settings' };
const FIELDS = {
  arbeit:      { label: 'Arbeit',      type: 'time',  min: 1 },
  pause:       { label: 'Pause',       type: 'time',  min: 0 },
  uebungen:    { label: 'Übungen',     type: 'count', min: 1 },
  runden:      { label: 'Runden',      type: 'count', min: 1 },
  rundenpause: { label: 'Rundenpause', type: 'time',  min: 0 },
};
const MAX = { time: 59 * 60 + 59, count: 99 };
const DEFAULT = { name: '', arbeit: 60, pause: 15, uebungen: 1, runden: 1, rundenpause: 35 };
const EXAMPLES = [
  { id: 'ex-tabata', name: 'Tabata', arbeit: 20, pause: 10, uebungen: 8, runden: 1, rundenpause: 0 },
  { id: 'ex-zirkel', name: 'Zirkel 5 × 3', arbeit: 45, pause: 15, uebungen: 5, runden: 3, rundenpause: 60 },
];
const PHASE_LABEL = { prep: 'Bereit machen', work: 'Arbeit', rest: 'Pause', roundrest: 'Rundenpause', done: 'Fertig!' };

const $ = (id) => document.getElementById(id);

// ---------- Speicher ----------

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

function clampField(field, value) {
  const f = FIELDS[field];
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT[field];
  return Math.min(MAX[f.type], Math.max(f.min, n));
}
function sanitize(w) {
  const out = { name: typeof w.name === 'string' ? w.name.slice(0, 40) : '' };
  for (const k of Object.keys(FIELDS)) out[k] = clampField(k, w[k]);
  if (w.id) out.id = String(w.id);
  return out;
}

let cfg = sanitize(load(LS.cur, DEFAULT) || DEFAULT);
let workouts = (Array.isArray(load(LS.list, null)) ? load(LS.list, null) : EXAMPLES).map(sanitize);
let settings = Object.assign({ muted: false, volume: 1 }, load(LS.set, {}));
Sound.configure(settings);

// ---------- Hilfen ----------

function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mmss = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return h ? h + ':' + mmss : mmss;
}

function buildPhases(c) {
  const p = [{ kind: 'prep', dur: PREP, u: 1, r: 1 }];
  for (let r = 1; r <= c.runden; r++) {
    for (let u = 1; u <= c.uebungen; u++) {
      p.push({ kind: 'work', dur: c.arbeit, u, r });
      if (u < c.uebungen && c.pause > 0) p.push({ kind: 'rest', dur: c.pause, u, r });
    }
    if (r < c.runden && c.rundenpause > 0) p.push({ kind: 'roundrest', dur: c.rundenpause, u: c.uebungen, r });
  }
  return p;
}
function totalSeconds(c) {
  return buildPhases(c).reduce((sum, p) => sum + (p.kind === 'prep' ? 0 : p.dur), 0);
}
function summary(w) {
  let s = fmt(w.arbeit) + ' / ' + fmt(w.pause) + ' · ' + w.uebungen + ' Üb. · ' + w.runden + ' Rd.';
  if (w.runden > 1 && w.rundenpause > 0) s += ' · ' + fmt(w.rundenpause) + ' Rundenpause';
  return s;
}

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c != null) el.append(c);
  return el;
}

// Zweistufige Bestätigung ohne Dialogfenster: erster Tipp „scharf", zweiter führt aus.
function armed(btn, question, action) {
  const original = btn.textContent;
  let timer = null;
  btn.addEventListener('click', () => {
    if (timer) {
      clearTimeout(timer); timer = null;
      btn.textContent = original; btn.classList.remove('armed');
      action();
    } else {
      btn.textContent = question; btn.classList.add('armed');
      timer = setTimeout(() => { timer = null; btn.textContent = original; btn.classList.remove('armed'); }, 3000);
    }
  });
}

// ---------- Einstell-Ansicht ----------

function renderSetup() {
  $('totalTime').textContent = fmt(totalSeconds(cfg));
  for (const el of document.querySelectorAll('[data-value]')) {
    const k = el.dataset.value;
    el.textContent = FIELDS[k].type === 'time' ? fmt(cfg[k]) : (k === 'runden' ? cfg[k] + 'X' : cfg[k]);
  }
  $('loadLabel').textContent = cfg.name ? cfg.name : 'Workouts';
}
function setField(field, value) {
  const v = clampField(field, value);
  if (v !== cfg[field]) { cfg[field] = v; cfg.name = ''; }
  save(LS.cur, cfg);
  renderSetup();
}

// ---------- Bottom-Sheet ----------

function openSheet(title, body) {
  $('sheetTitle').textContent = title;
  $('sheetBody').replaceChildren(body);
  $('sheet').hidden = false;
  $('backdrop').hidden = false;
}
function closeSheet() {
  $('sheet').hidden = true;
  $('backdrop').hidden = true;
  $('sheetBody').replaceChildren();
}

function stepper(value, min, max, step, onChange, unit) {
  const input = h('input', { type: 'number', inputMode: 'numeric', min, max, value, 'aria-label': unit });
  const set = (v, fromInput) => {
    v = Math.min(max, Math.max(min, Math.round(Number(v)) || 0));
    if (!fromInput || String(v) !== input.value) input.value = v;
    onChange(v);
  };
  const bump = (dir) => {
    const cur = Number(input.value) || 0;
    // Auf das nächste Vielfache der Schrittweite springen.
    const next = dir > 0 ? Math.floor(cur / step) * step + step : Math.ceil(cur / step) * step - step;
    set(next);
  };
  input.addEventListener('input', () => { if (input.value !== '') set(input.value, true); });
  input.addEventListener('blur', () => set(input.value));
  input.addEventListener('focus', () => input.select());
  return h('div', { class: 'stepper' },
    h('button', { class: 'step', 'aria-label': unit + ' mehr', onclick: () => bump(1) }, '+'),
    input,
    h('button', { class: 'step', 'aria-label': unit + ' weniger', onclick: () => bump(-1) }, '−'),
    h('div', { class: 'unit' }, unit));
}

function openField(field) {
  const f = FIELDS[field];
  let body;
  if (f.type === 'time') {
    let m = Math.floor(cfg[field] / 60), s = cfg[field] % 60;
    const apply = () => setField(field, m * 60 + s);
    body = h('div', { class: 'picker' },
      stepper(m, 0, 59, 1, (v) => { m = v; apply(); }, 'Minuten'),
      h('div', { class: 'colon' }, ':'),
      stepper(s, 0, 59, 5, (v) => { s = v; apply(); }, 'Sekunden'));
  } else {
    body = h('div', { class: 'picker' },
      stepper(cfg[field], f.min, MAX.count, 1, (v) => setField(field, v), 'Anzahl'));
  }
  openSheet(f.label, body);
}

function openWorkouts() {
  const body = h('div', { class: 'workouts' });
  const draw = () => {
    const nameInput = h('input', { type: 'text', maxLength: 40, placeholder: 'Name des Workouts', value: cfg.name, 'aria-label': 'Name' });
    const saveCurrent = () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      const entry = sanitize(Object.assign({}, cfg, { name }));
      const existing = workouts.find((w) => w.name.toLowerCase() === name.toLowerCase());
      if (existing) Object.assign(existing, entry, { id: existing.id });
      else workouts.push(Object.assign(entry, { id: 'w' + Date.now().toString(36) }));
      cfg.name = name;
      save(LS.list, workouts); save(LS.cur, cfg);
      renderSetup(); draw();
    };
    const list = h('div', { class: 'wlist' });
    if (!workouts.length) list.append(h('p', { class: 'empty' }, 'Noch keine Workouts gespeichert.'));
    for (const w of workouts) {
      const del = h('button', { class: 'mini danger' }, 'Löschen');
      armed(del, 'Wirklich?', () => {
        workouts = workouts.filter((x) => x !== w);
        save(LS.list, workouts); draw();
      });
      const title = h('div', { class: 'wname' }, w.name);
      const rename = h('button', { class: 'mini' }, 'Umbenennen');
      rename.addEventListener('click', () => {
        const inp = h('input', { type: 'text', maxLength: 40, value: w.name, 'aria-label': 'Neuer Name' });
        const commit = () => {
          const n = inp.value.trim();
          if (n) {
            if (cfg.name === w.name) { cfg.name = n; save(LS.cur, cfg); renderSetup(); }
            w.name = n; save(LS.list, workouts);
          }
          draw();
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
        inp.addEventListener('blur', commit);
        title.replaceWith(inp);
        inp.focus(); inp.select();
      });
      const pick = h('button', { class: 'wpick', onclick: () => {
        cfg = sanitize(w); delete cfg.id;
        save(LS.cur, cfg); renderSetup(); closeSheet();
      } }, title, h('div', { class: 'wsum' }, summary(w) + ' · ' + fmt(totalSeconds(w))));
      list.append(h('div', { class: 'witem' }, pick, h('div', { class: 'wactions' }, rename, del)));
    }
    body.replaceChildren(
      h('div', { class: 'saveform' }, nameInput, h('button', { class: 'primary small', onclick: saveCurrent }, 'Speichern')),
      h('p', { class: 'hintline' }, 'Speichert die aktuellen Einstellungen (' + summary(cfg) + ').'),
      list);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveCurrent(); });
  };
  draw();
  openSheet('Workouts', body);
}

function openSettings() {
  const toggle = h('input', { type: 'checkbox', checked: !settings.muted, id: 'soundOn' });
  const vol = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(settings.volume * 100), 'aria-label': 'Lautstärke' });
  const apply = () => {
    settings = { muted: !toggle.checked, volume: Number(vol.value) / 100 };
    save(LS.set, settings); Sound.configure(settings);
  };
  toggle.addEventListener('change', apply);
  vol.addEventListener('input', apply);
  openSheet('Einstellungen', h('div', { class: 'settings' },
    h('label', { class: 'setrow', htmlFor: 'soundOn' }, h('span', {}, 'Signaltöne'), toggle),
    h('div', { class: 'setrow' }, h('span', {}, 'Lautstärke'), vol),
    h('button', { class: 'mini wide', onclick: () => Sound.test() }, 'Töne testen'),
    h('p', { class: 'hintline' }, 'Die Lautstärke richtet sich zusätzlich nach der Medienlautstärke des Handys. Das Display bleibt während des Workouts an – bei gesperrtem Bildschirm kann der Browser keine Töne abspielen.')));
}

// ---------- Ablauf ----------

let run = null; // { phases, idx, phaseEnd, paused, remaining, done }
let ticker = null;
let wake = null;

async function holdWake() {
  try {
    if ('wakeLock' in navigator && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch (e) {}
}
function dropWake() {
  try { if (wake) wake.release(); } catch (e) {}
  wake = null;
}

function scheduleSounds(opts) {
  if (opts && opts.cancel) Sound.cancel();
  const cur = run.phases[run.idx];
  const next = run.phases[run.idx + 1];
  if (opts && opts.startCue && cur.kind !== 'prep') Sound.cue(cur.kind, 0);
  Sound.schedulePhase((run.phaseEnd - Date.now()) / 1000, next ? next.kind : 'done');
}

async function start() {
  await Sound.unlock();
  Sound.cancel();
  const phases = buildPhases(cfg);
  run = { phases, idx: 0, phaseEnd: Date.now() + phases[0].dur * 1000, paused: false, remaining: 0, done: false };
  document.body.dataset.view = 'run';
  holdWake();
  scheduleSounds();
  renderRun(true);
  clearInterval(ticker);
  ticker = setInterval(tick, 100);
}

function tick() {
  if (!run || run.paused || run.done) return;
  const now = Date.now();
  let moved = false;
  while (now >= run.phaseEnd) {
    if (run.idx >= run.phases.length - 1) { finish(); return; }
    run.idx++;
    run.phaseEnd += run.phases[run.idx].dur * 1000;
    moved = true;
  }
  // Das Startsignal der neuen Phase wurde schon am Ende der alten geplant und
  // klingt gerade – deshalb hier nichts abbrechen.
  if (moved) scheduleSounds();
  renderRun(moved);
}

function finish() {
  run.done = true;
  clearInterval(ticker); ticker = null;
  dropWake();
  renderRun(true);
}

function stop() {
  Sound.cancel();
  clearInterval(ticker); ticker = null;
  dropWake();
  run = null;
  document.body.dataset.view = 'setup';
  delete document.body.dataset.phase;
  renderSetup();
}

function togglePause() {
  if (!run) return;
  if (run.done) { stop(); return; }
  if (run.paused) {
    run.paused = false;
    run.phaseEnd = Date.now() + run.remaining;
    Sound.resume().then(() => { if (run && !run.paused && !run.done) scheduleSounds({ cancel: true }); });
    holdWake();
  } else {
    run.paused = true;
    run.remaining = Math.max(0, run.phaseEnd - Date.now());
    Sound.cancel();
  }
  renderRun(true);
}

function skip() {
  if (!run || run.done) return;
  if (run.idx >= run.phases.length - 1) {
    Sound.cancel(); Sound.cue('done', 0);
    finish();
    return;
  }
  run.idx++;
  const dur = run.phases[run.idx].dur * 1000;
  if (run.paused) { run.remaining = dur; Sound.cancel(); }
  else { run.phaseEnd = Date.now() + dur; scheduleSounds({ cancel: true, startCue: true }); }
  renderRun(true);
}

const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="44" height="44"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="44" height="44"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="44" height="44"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let lastShown = '';
function renderRun(full) {
  if (!run) return;
  const cur = run.phases[run.idx];
  const left = run.done ? 0 : (run.paused ? run.remaining : Math.max(0, run.phaseEnd - Date.now()));
  const shown = fmt(Math.ceil(left / 1000));
  if (shown !== lastShown || full) {
    lastShown = shown;
    $('countdown').textContent = shown;
    let rest = left / 1000;
    for (let i = run.idx + 1; i < run.phases.length; i++) rest += run.phases[i].dur;
    $('runTotal').textContent = run.done ? '' : 'Rest ' + fmt(Math.ceil(rest));
  }
  if (!full) return;
  const kind = run.done ? 'done' : cur.kind;
  document.body.dataset.phase = kind;
  document.body.classList.toggle('paused', run.paused);
  $('phaseLabel').textContent = run.paused ? 'Pausiert' : PHASE_LABEL[kind];
  $('runRound').textContent = run.done ? '' : 'Runde ' + cur.r + '/' + cfg.runden;
  $('runInfo').textContent = run.done
    ? 'Workout geschafft – ' + fmt(totalSeconds(cfg))
    : (kind === 'prep' ? 'Gleich geht es los' : 'Übung ' + cur.u + '/' + cfg.uebungen);
  const next = run.phases[run.idx + 1];
  $('runNext').textContent = run.done ? '' : (next ? 'Danach: ' + PHASE_LABEL[next.kind] + ' ' + fmt(next.dur) : 'Danach: Ende');
  const pb = $('pauseBtn');
  pb.innerHTML = run.done ? CHECK_ICON : (run.paused ? PLAY_ICON : PAUSE_ICON);
  pb.setAttribute('aria-label', run.done ? 'Zurück' : (run.paused ? 'Fortsetzen' : 'Pause'));
}

// ---------- Verdrahtung ----------

$('startBtn').addEventListener('click', start);
$('pauseBtn').addEventListener('click', togglePause);
$('skipBtn').addEventListener('click', skip);
armed($('stopBtn'), 'Wirklich?', stop);
$('menuBtn').addEventListener('click', openSettings);
$('loadRow').addEventListener('click', openWorkouts);
for (const row of document.querySelectorAll('[data-field]')) {
  row.addEventListener('click', () => openField(row.dataset.field));
}
$('sheetDone').addEventListener('click', closeSheet);
$('backdrop').addEventListener('click', closeSheet);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !run || run.done) return;
  holdWake();
  if (run.paused) return;
  // Nach einer Unterbrechung (App im Hintergrund) stimmt die Audio-Uhr nicht mehr
  // mit der Wanduhr überein: Stand nachziehen und Töne neu planen.
  Sound.resume().then(() => {
    if (!run || run.paused || run.done) return;
    tick();
    if (run && !run.done) scheduleSounds({ cancel: true });
  });
});

renderSetup();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
