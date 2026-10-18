// Chord mode: a piano chord with one note on top, named by its simple interval
// above the chord's root. No DOM or audio here, so it can be tested with
// `node --test`.

import { INTERVALS, LETTERS, LETTER_PC, PREFERRED_BLACK, noteName, spellings } from "./theory.js";

// Only m2 … P8 are needed, since the note on top can be in any octave
// (P8 means the root is on top).
export const CHORD_INTERVALS = INTERVALS.slice(1, 13);

// Each tone is [semitones above the root, interval number], which decides
// the tone's letter.
export const CHORD_TYPES = {
  maj: { name: "major", tones: [[0, 1], [4, 3], [7, 5]] },
  min: { name: "minor", tones: [[0, 1], [3, 3], [7, 5]] },
  dim: { name: "diminished", tones: [[0, 1], [3, 3], [6, 5]] },
  aug: { name: "augmented", tones: [[0, 1], [4, 3], [8, 5]] },
  maj7: { name: "major 7th", tones: [[0, 1], [4, 3], [7, 5], [11, 7]] },
  dom7: { name: "dominant 7th", tones: [[0, 1], [4, 3], [7, 5], [10, 7]] },
  min7: { name: "minor 7th", tones: [[0, 1], [3, 3], [7, 5], [10, 7]] },
  m7b5: { name: "half-diminished 7th", tones: [[0, 1], [3, 3], [6, 5], [10, 7]] },
};

// Major keys by the tonic's pitch class, spelled the way they're usually written.
export const KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const DEGREES = [
  { numeral: "I", type: "maj" },
  { numeral: "ii", type: "min" },
  { numeral: "iii", type: "min" },
  { numeral: "IV", type: "maj" },
  { numeral: "V", type: "maj" },
  { numeral: "vi", type: "min" },
  { numeral: "vii°", type: "dim" },
];

// Roots sit between F2 and E3: low enough to leave room for a note on top,
// high enough that a close-voiced chord doesn't sound muddy.
const LOWEST_ROOT = 41;

const mod12 = (n) => ((n % 12) + 12) % 12;

/** Spell `midi` using the given letter, e.g. 60 as B → B♯3. */
function spellAt(midi, letter) {
  let accidental = mod12(midi - LETTER_PC[letter]);
  if (accidental > 6) accidental -= 12;
  const octave = (midi - LETTER_PC[letter] - accidental) / 12 - 1;
  return { letter, accidental, octave };
}

/** "B♭" (no octave). */
export function pitchName(note, opts) {
  return noteName({ ...note, octave: 0 }, opts).slice(0, -1);
}

/** The key's tonic as { letter, accidental }. */
function tonicOf(key) {
  const [letter, acc] = KEYS[key];
  return { letter: LETTERS.indexOf(letter), accidental: { "#": 1, b: -1 }[acc] ?? 0 };
}

/**
 * The letter for a fixed chord's root: whichever spelling of a black key
 * gives the chord fewer accidentals (D♭ major, C♯ minor), with ties going to
 * the usual key-signature spelling.
 */
function rootLetter(pc, type) {
  let best = null;
  for (const root of spellings(60 + pc)) {
    const cost = CHORD_TYPES[type].tones
      .reduce((sum, [s, n]) => sum + Math.abs(spellAt(60 + pc + s, (root.letter + n - 1) % 7).accidental), 0);
    const preferred = noteName(root, { ascii: true }).startsWith(PREFERRED_BLACK[pc] ?? "");
    if (!best || cost < best.cost || (cost === best.cost && preferred)) best = { letter: root.letter, cost };
  }
  return best.letter;
}

/** The chords the settings allow: the key's seven triads, or the one fixed chord. */
export function chordChoices({ chordSource, key, chordRoot, chordType }) {
  if (chordSource === "key") {
    const tonic = tonicOf(key);
    return DEGREES.map(({ numeral, type }, i) => ({
      rootPc: mod12(key + MAJOR_SCALE[i]),
      letter: (tonic.letter + i) % 7,
      type,
      numeral,
    }));
  }
  return [{ rootPc: chordRoot, letter: rootLetter(chordRoot, chordType), type: chordType }];
}

/** Root position, close voicing: the chord's MIDI notes and their spellings. */
export function voice(chord) {
  const rootMidi = LOWEST_ROOT + mod12(chord.rootPc - LOWEST_ROOT);
  const tones = CHORD_TYPES[chord.type].tones;
  return {
    midis: tones.map(([s]) => rootMidi + s),
    notes: tones.map(([s, n]) => spellAt(rootMidi + s, (chord.letter + n - 1) % 7)),
  };
}

/** "B♭ major" (or "Bb major" with ascii: true). */
export function chordName(chord, opts) {
  return `${pitchName(spellAt(60 + chord.rootPc, chord.letter), opts)} ${CHORD_TYPES[chord.type].name}`;
}

/** I–IV–V–I in the key, as lists of MIDI notes. */
export function cadence(key) {
  const chords = chordChoices({ chordSource: "key", key });
  return [0, 3, 4, 0].map((i) => voice(chords[i]).midis);
}

/**
 * Every (chord, top note) pair allowed by the settings, grouped by interval.
 * The top note is in the note range and above the chord. In key mode it must
 * also be in the key.
 */
export function chordCandidates(settings) {
  const { intervals, low, high, available } = settings;
  const inKey = settings.chordSource === "key";
  const chords = chordChoices(settings).map((chord) => ({ chord, ...voice(chord) }));
  const byInterval = new Map();
  for (const semitones of intervals) {
    const options = [];
    for (const { chord, midis } of chords) {
      if (inKey && !MAJOR_SCALE.includes(mod12(chord.rootPc + semitones - settings.key))) continue;
      for (let m = Math.max(low, Math.max(...midis) + 1); m <= high; m++) {
        if (available.has(m) && mod12(m - chord.rootPc) === semitones % 12) options.push({ chord, topMidi: m });
      }
    }
    if (options.length) byInterval.set(semitones, options);
  }
  return byInterval;
}

/** How to spell the top note: by its letter in the key, or by the interval's number. */
function spellTop(chord, topMidi, semitones, key) {
  if (key == null) return spellAt(topMidi, (chord.letter + INTERVALS[semitones].number - 1) % 7);
  const degree = MAJOR_SCALE.indexOf(mod12(topMidi - key));
  return spellAt(topMidi, (tonicOf(key).letter + degree) % 7);
}

/**
 * Pick a question the same way as interval mode: a random interval first,
 * then a random chord and top note for it. Avoids repeating `previous` exactly
 * when there's any alternative. Returns null if nothing fits.
 */
export function pickChordQuestion(settings, previous = null, random = Math.random) {
  const options = [];
  for (const [semitones, list] of chordCandidates(settings)) {
    for (const { chord, topMidi } of list) options.push({ semitones, chord, topMidi });
  }
  if (!options.length) return null;
  const isRepeat = (o) =>
    previous && o.topMidi === previous.topMidi && o.chord.rootPc === previous.chord.rootPc && o.chord.type === previous.chord.type;
  const fresh = options.length > 1 ? options.filter((o) => !isRepeat(o)) : options;

  const semitoneChoices = [...new Set(fresh.map((o) => o.semitones))];
  const semitones = semitoneChoices[Math.floor(random() * semitoneChoices.length)];
  const matching = fresh.filter((o) => o.semitones === semitones);
  const { chord, topMidi } = matching[Math.floor(random() * matching.length)];
  const { midis, notes } = voice(chord);
  return {
    semitones,
    interval: INTERVALS[semitones],
    chord,
    chordMidis: midis,
    chordNotes: notes,
    topMidi,
    top: spellTop(chord, topMidi, semitones, settings.chordSource === "key" ? settings.key : null),
  };
}
