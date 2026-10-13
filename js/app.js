import { INTERVALS, candidates, fullName, keyName, noteName, pickQuestion, spellInterval } from "./theory.js";
import { Player } from "./audio.js";

const STORAGE_KEY = "ear-trainer-settings";
const PRESETS = {
  octave: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  thirds: [3, 4],
  perfect: [5, 7, 12],
  clear: [],
};
const DEFAULTS = {
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
let available = new Set(); // MIDI notes the current instrument has
let ready = false;

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
}

function quizSettings() {
  return { ...settings, available };
}

async function selectInstrument(name) {
  stopQuiz();
  ready = false;
  updateControls();
  settings.instrument = name;
  const files = manifest.instruments[name];
  available = new Set(Object.keys(files).map(Number));
  const notes = [...available].sort((a, b) => a - b);
  const lowest = notes[0];
  const highest = notes.at(-1);
  if (!available.has(settings.low)) settings.low = lowest;
  if (!available.has(settings.high)) settings.high = highest;

  for (const [select, value] of [[$("range-low"), settings.low], [$("range-high"), settings.high]]) {
    select.replaceChildren(...notes.map((m) => new Option(keyName(m), m)));
    select.value = value;
  }
  renderIntervals();
  saveSettings();

  setStatus(`Loading ${name}…`);
  try {
    await player.load(name, files);
    ready = true;
    setStatus(phase === "idle" ? "Press Start when you're ready." : "");
  } catch (err) {
    setStatus(`Couldn't load samples: ${err.message}`);
  }
  updateControls();
}

function renderIntervals() {
  const fits = candidates({ ...quizSettings(), intervals: INTERVALS.map((iv) => iv.semitones) });
  $("intervals").replaceChildren(
    ...INTERVALS.map((iv) => {
      const label = document.createElement("label");
      label.title = fullName(iv);
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = iv.semitones;
      box.checked = settings.intervals.includes(iv.semitones);
      label.append(box, iv.name);
      if (!fits.has(iv.semitones)) {
        label.classList.add("unplayable");
        label.title += " (doesn't fit in the note range)";
      }
      return label;
    }),
  );
}

function renderSettings() {
  $("instrument").replaceChildren(
    ...Object.keys(manifest.instruments).map((name) => new Option(name[0].toUpperCase() + name.slice(1), name)),
  );
  $("instrument").value = settings.instrument;
  document.querySelector(`input[name=direction][value=${settings.direction}]`).checked = true;
  document.querySelector(`input[name=advance][value=${settings.advance}]`).checked = true;
  for (const key of TIMINGS) {
    $(key).value = settings[key];
    showTiming(key);
  }
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
    settings.intervals = [...$("intervals").querySelectorAll("input:checked")].map((b) => Number(b.value));
    saveSettings();
  });

  for (const button of document.querySelectorAll("[data-preset]")) {
    button.addEventListener("click", () => {
      settings.intervals = [...PRESETS[button.dataset.preset]];
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

function nextQuestion() {
  clearTimeout(timer);
  const q = pickQuestion(quizSettings(), question);
  if (!q) {
    stopQuiz();
    question = null;
    phase = "idle";
    $("answer").hidden = true;
    updateControls();
    setStatus(
      settings.intervals.length
        ? `None of the ticked intervals fit between ${keyName(settings.low)} and ${keyName(settings.high)}.`
        : "Tick at least one interval.",
    );
    return;
  }
  question = q;
  $("answer").hidden = true;
  phase = "playing";
  setStatus("Listen…");
  const duration = player.play(settings.instrument, question, settings.noteLength);
  scheduleReveal(duration + settings.revealDelay);
  updateControls();
}

function scheduleReveal(seconds) {
  clearTimeout(timer);
  timer = setTimeout(reveal, seconds * 1000);
}

function reveal() {
  const { interval, low, high } = spellInterval(question.lowMidi, question.semitones);
  const [first, second] = question.descending ? [high, low] : [low, high];
  $("answer-interval").textContent = interval.name;
  $("answer-full").textContent = fullName(interval) + (question.descending ? ", descending" : "");
  $("answer-notes").textContent = `${noteName(first)} → ${noteName(second)}`;
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
  const duration = player.play(settings.instrument, question, settings.noteLength);
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
