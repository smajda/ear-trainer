import { INTERVALS, candidates, fullName, keyName, noteName, pickQuestion, spellInterval, spellings } from "./theory.js";
import {
  CHORD_INTERVALS, CHORD_TYPES, KEYS, cadence, chordCandidates, chordChoices, chordName, pickChordQuestion, pitchName,
} from "./chords.js";
import { Player } from "./audio.js";

const STORAGE_KEY = "ear-trainer-settings";
const PRESETS = {
  octave: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  thirds: [3, 4],
  perfect: [5, 7, 12],
  clear: [],
};
const DEFAULTS = {
  mode: "intervals", // or "chord"
  chordSource: "key", // or "fixed"
  key: 0, // tonic pitch class
  chordRoot: 0,
  chordType: "maj",
  chordIntervals: PRESETS.octave,
  instrument: null,
  low: null,
  high: null,
  intervals: PRESETS.octave,
  direction: "up",
  advance: "manual",
  noteLength: 1,
  revealDelay: 1.5,
  advanceDelay: 3,
};
const TIMINGS = ["noteLength", "revealDelay", "advanceDelay"];

const $ = (id) => document.getElementById(id);
const player = new Player();
let manifest;
let settings;
let available = new Set(); // MIDI notes the current instrument can play
let ready = false;
let needCadence = true; // play the key's cadence before the next chord question

// quiz state
let question = null;
let phase = "idle"; // idle | playing | revealed
let running = false; // auto mode: keep going until stopped
let timer = null;

// ---- settings ----

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  renderSummary();
}

/** The one-line summary shown above the quiz, e.g. "Chord mode, key of C major". */
function renderSummary() {
  let text = "Interval mode";
  if (chordMode()) {
    text = settings.chordSource === "key"
      ? `Chord mode, key of ${prettyKey(KEYS[settings.key])} major`
      : `Chord mode, fixed ${chordName(chordChoices(settings)[0])}`;
  }
  $("summary").textContent = text;
}

const chordMode = () => settings.mode === "chord";

// the two modes keep separate interval choices
const intervalsKey = () => (chordMode() ? "chordIntervals" : "intervals");

function quizSettings() {
  return { ...settings, intervals: settings[intervalsKey()], available };
}

async function selectInstrument(name) {
  stopQuiz();
  settings.instrument = name;
  // every note between the lowest and highest sample: any gaps (like the
  // piano's) are filled by pitch-shifting the nearest sample
  const sampled = Object.keys(manifest.instruments[name]).map(Number);
  const lowest = Math.min(...sampled);
  const highest = Math.max(...sampled);
  available = new Set(Array.from({ length: highest - lowest + 1 }, (_, i) => lowest + i));
  const notes = [...available];
  if (!available.has(settings.low)) settings.low = lowest;
  if (!available.has(settings.high)) settings.high = highest;

  for (const [select, value] of [[$("range-low"), settings.low], [$("range-high"), settings.high]]) {
    select.replaceChildren(...notes.map((m) => new Option(keyName(m), m)));
    select.value = value;
  }
  renderIntervals();
  saveSettings();
  await loadSamples();
}

/** Load the instrument, plus the piano in chord mode (both are cached). */
async function loadSamples() {
  ready = false;
  updateControls();
  const names = [settings.instrument];
  if (chordMode() && settings.instrument !== "piano") names.push("piano");
  setStatus(`Loading ${names.join(" and ")}…`);
  try {
    await Promise.all(names.map((name) => player.load(name, manifest.instruments[name])));
    ready = true;
    setStatus(phase === "idle" ? "Press Start when you're ready." : "");
  } catch (err) {
    setStatus(`Couldn't load samples: ${err.message}`);
  }
  updateControls();
}

function renderIntervals() {
  const list = chordMode() ? CHORD_INTERVALS : INTERVALS;
  const all = { ...quizSettings(), intervals: list.map((iv) => iv.semitones) };
  const fits = chordMode() ? chordCandidates(all) : candidates(all);
  $("intervals").replaceChildren(
    ...list.map((iv) => {
      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "btn btn-sm";
      box.value = iv.semitones;
      box.checked = settings[intervalsKey()].includes(iv.semitones);
      box.setAttribute("aria-label", iv.name);
      box.title = intervalName(iv);
      if (!fits.has(iv.semitones)) {
        box.classList.add("unplayable");
        box.title += chordMode() ? " (doesn't fit over these chords in the note range)" : " (doesn't fit in the note range)";
      }
      return box;
    }),
  );
}

function renderSettings() {
  $("instrument").replaceChildren(
    ...Object.keys(manifest.instruments).map((name) => new Option(name[0].toUpperCase() + name.slice(1), name)),
  );
  $("instrument").value = settings.instrument;
  $("key").replaceChildren(...KEYS.map((name, pc) => new Option(`${prettyKey(name)} major`, pc)));
  $("chord-root").replaceChildren(
    ...KEYS.map((_, pc) => new Option(spellings(60 + pc).map((n) => pitchName(n)).join("/"), pc)),
  );
  $("chord-type").replaceChildren(...Object.entries(CHORD_TYPES).map(([type, { name }]) => new Option(name, type)));
  $("key").value = settings.key;
  $("chord-root").value = settings.chordRoot;
  $("chord-type").value = settings.chordType;
  document.querySelector(`input[name=mode][value=${settings.mode}]`).checked = true;
  document.querySelector(`input[name=chordSource][value=${settings.chordSource}]`).checked = true;
  showMode();
  document.querySelector(`input[name=direction][value=${settings.direction}]`).checked = true;
  document.querySelector(`input[name=advance][value=${settings.advance}]`).checked = true;
  for (const key of TIMINGS) {
    $(key).value = settings[key];
    showTiming(key);
  }
}

/** Show the settings that apply to the current mode. */
function showMode() {
  $("chord-settings").hidden = !chordMode();
  $("direction-settings").hidden = chordMode();
  $("instrument-legend").textContent = chordMode() ? "Instrument (note on top)" : "Instrument";
  $("range-legend").textContent = chordMode() ? "Range for the note on top" : "Note range";
  for (const label of document.querySelectorAll("[data-source]")) {
    label.hidden = label.dataset.source !== settings.chordSource;
  }
}

const prettyKey = (name) => name.replace("#", "♯").replace("b", "♭");

function intervalName(interval) {
  return chordMode() && interval.semitones === 12 ? "Root (octave)" : fullName(interval);
}

function showTiming(key) {
  $(`${key}-out`).value = `${Number(settings[key]).toFixed(1)}s`;
}

function bindSettings() {
  // after a mouse click in the settings, drop focus so Space goes back to
  // the quiz instead of re-toggling the control (keyboard clicks have detail 0)
  $("settings").addEventListener("click", (e) => {
    if (e.detail > 0 && !e.target.closest("select")) document.activeElement?.blur();
  });

  $("instrument").addEventListener("change", (e) => selectInstrument(e.target.value));

  for (const id of ["range-low", "range-high"]) {
    $(id).addEventListener("change", (e) => {
      const value = Number(e.target.value);
      if (id === "range-low") settings.low = value;
      else settings.high = value;
      // keep low ≤ high by moving the other end
      if (settings.low > settings.high) {
        if (id === "range-low") settings.high = value;
        else settings.low = value;
        $("range-low").value = settings.low;
        $("range-high").value = settings.high;
      }
      renderIntervals();
      saveSettings();
    });
  }

  $("intervals").addEventListener("change", () => {
    settings[intervalsKey()] = [...$("intervals").querySelectorAll("input:checked")].map((b) => Number(b.value));
    saveSettings();
  });

  for (const button of document.querySelectorAll("[data-preset]")) {
    button.addEventListener("click", () => {
      settings[intervalsKey()] = [...PRESETS[button.dataset.preset]];
      renderIntervals();
      saveSettings();
    });
  }

  for (const name of ["direction", "advance"]) {
    for (const radio of document.querySelectorAll(`input[name=${name}]`)) {
      radio.addEventListener("change", () => {
        settings[name] = radio.value;
        saveSettings();
        if (name === "advance") {
          // switching modes mid-quiz: stop auto-advancing, keep the current question
          running = false;
          clearTimeout(timer);
          if (phase === "playing") scheduleReveal(0);
          updateControls();
        }
      });
    }
  }

  for (const radio of document.querySelectorAll("input[name=mode]")) {
    radio.addEventListener("change", () => {
      // the current question belongs to the other mode, so start over
      stopQuiz();
      question = null;
      phase = "idle";
      $("answer").hidden = true;
      settings.mode = radio.value;
      needCadence = true;
      showMode();
      renderIntervals();
      saveSettings();
      loadSamples();
    });
  }

  const chordSetting = (name, value) => {
    settings[name] = value;
    needCadence = true;
    showMode();
    renderIntervals();
    saveSettings();
  };
  for (const radio of document.querySelectorAll("input[name=chordSource]")) {
    radio.addEventListener("change", () => chordSetting("chordSource", radio.value));
  }
  $("key").addEventListener("change", (e) => chordSetting("key", Number(e.target.value)));
  $("chord-root").addEventListener("change", (e) => chordSetting("chordRoot", Number(e.target.value)));
  $("chord-type").addEventListener("change", (e) => chordSetting("chordType", e.target.value));

  for (const key of TIMINGS) {
    $(key).addEventListener("input", (e) => {
      settings[key] = Number(e.target.value);
      showTiming(key);
      saveSettings();
    });
  }
}

// ---- quiz ----

function setStatus(text) {
  $("status").textContent = text;
}

function updateControls() {
  const primary = $("primary");
  let label = "Start";
  if (settings.advance === "auto" && running) label = "Stop";
  else if (settings.advance === "manual" && phase !== "idle") label = "Next";
  primary.firstChild.textContent = `${label} `;
  primary.disabled = !ready;
  $("replay").disabled = !ready || !question;
}

/** Play the current question, optionally after the key's cadence. */
function play(withCadence = false) {
  if (!chordMode()) return player.play(settings.instrument, question, settings.noteLength);
  return player.playChord(settings.instrument, question, settings.noteLength, withCadence ? cadence(settings.key) : []);
}

function noFitMessage() {
  if (!settings[intervalsKey()].length) return "Tick at least one interval.";
  const range = `between ${keyName(settings.low)} and ${keyName(settings.high)}`;
  if (!chordMode()) return `None of the ticked intervals fit ${range}.`;
  const over = settings.chordSource === "key"
    ? `the chords of ${prettyKey(KEYS[settings.key])} major`
    : chordName(chordChoices(settings)[0]);
  return `None of the ticked intervals fit over ${over} ${range}.`;
}

function nextQuestion() {
  clearTimeout(timer);
  const q = chordMode() ? pickChordQuestion(quizSettings(), question) : pickQuestion(quizSettings(), question);
  if (!q) {
    stopQuiz();
    question = null;
    phase = "idle";
    $("answer").hidden = true;
    updateControls();
    setStatus(noFitMessage());
    return;
  }
  question = q;
  $("answer").hidden = true;
  phase = "playing";
  const withCadence = chordMode() && settings.chordSource === "key" && needCadence;
  needCadence = false;
  setStatus(withCadence ? `Listen… (${prettyKey(KEYS[settings.key])} major: I–IV–V–I first)` : "Listen…");
  const duration = play(withCadence);
  scheduleReveal(duration + settings.revealDelay);
  updateControls();
}

function scheduleReveal(seconds) {
  clearTimeout(timer);
  timer = setTimeout(reveal, seconds * 1000);
}

function reveal() {
  if (chordMode()) {
    const { interval, chord, chordNotes, top } = question;
    $("answer-interval").textContent = interval.name;
    $("answer-full").textContent = intervalName(interval);
    $("answer-chord").textContent = `${pitchName(top)} over ${chordName(chord)}`;
    $("answer-notes").textContent = `${chordNotes.map((n) => noteName(n)).join(" ")} + ${noteName(top)}`;
  } else {
    const { interval, low, high } = spellInterval(question.lowMidi, question.semitones);
    const [first, second] = question.descending ? [high, low] : [low, high];
    $("answer-interval").textContent = interval.name;
    $("answer-full").textContent = fullName(interval) + (question.descending ? ", descending" : "");
    $("answer-notes").textContent = `${noteName(first)} → ${noteName(second)}`;
  }
  $("answer-chord").hidden = !chordMode();
  $("answer").hidden = false;
  phase = "revealed";
  setStatus("");
  if (settings.advance === "auto" && running) {
    timer = setTimeout(nextQuestion, settings.advanceDelay * 1000);
  }
  updateControls();
}

function replay() {
  if (!question || !ready) return;
  clearTimeout(timer);
  const duration = play();
  if (phase === "playing") {
    scheduleReveal(duration + settings.revealDelay);
  } else if (settings.advance === "auto" && running) {
    timer = setTimeout(nextQuestion, (duration + settings.advanceDelay) * 1000);
  }
}

function stopQuiz() {
  clearTimeout(timer);
  player.stop();
  running = false;
  if (phase === "playing") phase = "idle";
  updateControls();
}

async function onPrimary() {
  if (!ready) return;
  await player.unlock();
  if (settings.advance === "auto") {
    if (running) {
      stopQuiz();
      setStatus("Stopped.");
      return;
    }
    running = true;
  }
  nextQuestion();
}

function bindQuiz() {
  $("primary").addEventListener("click", onPrimary);
  $("replay").addEventListener("click", replay);
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.key === "Escape") {
      $("settings-drawer").checked = false;
      return;
    }
    // leave keys alone while a form control has focus; a focused button
    // already handles Space itself
    if (e.target.closest("input, select, textarea")) return;
    if (e.code === "Space") {
      if (e.target.closest("button")) return;
      e.preventDefault();
      onPrimary();
    } else if (e.key === "r" || e.key === "R") {
      replay();
    }
  });
}

// ---- start up ----

async function init() {
  settings = loadSettings();
  try {
    const res = await fetch("samples/instruments.json");
    manifest = await res.json();
  } catch {
    setStatus("Couldn't load samples/instruments.json. Serve this folder over HTTP (npm start).");
    return;
  }
  const names = Object.keys(manifest.instruments);
  if (!names.includes(settings.instrument)) settings.instrument = names[0];
  renderSettings();
  bindSettings();
  bindQuiz();
  await selectInstrument(settings.instrument);
}

init();
