// Intervals, note spelling and question picking. No DOM or audio here, so it
// can be tested with `node --test`.

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

// For black keys spelled either way with equally simple results, use the
// spelling most common in key signatures.
export const PREFERRED_BLACK = { 1: "C#", 3: "Eb", 6: "F#", 8: "Ab", 10: "Bb" };

// semitones → interval. `number` is the interval's size in letter names
// (3 for a third), which decides how the upper note is spelled. The tritones
// are labelled with both names but spelled as augmented 4th / 11th.
export const INTERVALS = [
  { semitones: 0, name: "P1", number: 1 },
  { semitones: 1, name: "m2", number: 2 },
  { semitones: 2, name: "M2", number: 2 },
  { semitones: 3, name: "m3", number: 3 },
  { semitones: 4, name: "M3", number: 3 },
  { semitones: 5, name: "P4", number: 4 },
  { semitones: 6, name: "A4/d5", number: 4 },
  { semitones: 7, name: "P5", number: 5 },
  { semitones: 8, name: "m6", number: 6 },
  { semitones: 9, name: "M6", number: 6 },
  { semitones: 10, name: "m7", number: 7 },
  { semitones: 11, name: "M7", number: 7 },
  { semitones: 12, name: "P8", number: 8 },
  { semitones: 13, name: "m9", number: 9 },
  { semitones: 14, name: "M9", number: 9 },
  { semitones: 15, name: "m10", number: 10 },
  { semitones: 16, name: "M10", number: 10 },
  { semitones: 17, name: "P11", number: 11 },
  { semitones: 18, name: "A11/d12", number: 11 },
  { semitones: 19, name: "P12", number: 12 },
  { semitones: 20, name: "m13", number: 13 },
  { semitones: 21, name: "M13", number: 13 },
  { semitones: 22, name: "m14", number: 14 },
  { semitones: 23, name: "M14", number: 14 },
  { semitones: 24, name: "P15", number: 15 },
];

// A spelled note: letter index (0 = C), accidental (-2..2) and octave.
// The octave belongs to the letter, so B#3 sounds the same as C4.
export function midiOf({ letter, accidental, octave }) {
  return 12 * (octave + 1) + LETTER_PC[letter] + accidental;
}

/** The ways a key can be spelled without double accidentals. */
export function spellings(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  const white = LETTER_PC.indexOf(pc);
  if (white >= 0) return [{ letter: white, accidental: 0, octave }];
  const below = LETTER_PC.indexOf(pc - 1);
  const above = LETTER_PC.indexOf(pc + 1);
  return [
    { letter: below, accidental: 1, octave },
    { letter: above, accidental: -1, octave },
  ];
}

/** The note `number` letter names above `low`, sounding `semitones` higher. */
function spellAbove(low, number, semitones) {
  const steps = low.letter + number - 1;
  const letter = steps % 7;
  const octave = low.octave + Math.floor(steps / 7);
  const accidental = midiOf(low) + semitones - midiOf({ letter, accidental: 0, octave });
  return { letter, accidental, octave };
}

/**
 * Spell an interval: the low note is spelled whichever way keeps the high
 * note simplest (avoiding double sharps/flats), e.g. a M3 above the A#/Bb key
 * is Bb → D rather than A# → C##.
 */
export function spellInterval(lowMidi, semitones) {
  const interval = INTERVALS[semitones];
  let best = null;
  for (const low of spellings(lowMidi)) {
    const high = spellAbove(low, interval.number, semitones);
    const cost = Math.abs(high.accidental);
    const preferred = noteName(low, { ascii: true }).startsWith(PREFERRED_BLACK[lowMidi % 12] ?? "");
    if (!best || cost < best.cost || (cost === best.cost && preferred)) {
      best = { low, high, cost };
    }
  }
  return { interval, low: best.low, high: best.high };
}

const ACCIDENTALS = { "-2": "𝄫", "-1": "♭", 0: "", 1: "♯", 2: "𝄪" };
const ASCII_ACCIDENTALS = { "-2": "bb", "-1": "b", 0: "", 1: "#", 2: "##" };

/** "B♭3" (or "Bb3" with ascii: true). */
export function noteName(note, { ascii = false } = {}) {
  const acc = (ascii ? ASCII_ACCIDENTALS : ACCIDENTALS)[note.accidental];
  return `${LETTERS[note.letter]}${acc}${note.octave}`;
}

/** Name for a key regardless of context: "C4", or "A♯3/B♭3" for black keys. */
export function keyName(midi, opts) {
  return spellings(midi).map((n) => noteName(n, opts)).join("/");
}

/**
 * Every (interval, low note) pair allowed by the settings, grouped by interval.
 * `available` is the set of MIDI notes the instrument has samples for.
 */
export function candidates({ intervals, low, high, available }) {
  const byInterval = new Map();
  for (const semitones of intervals) {
    const lows = [];
    for (let m = low; m + semitones <= high; m++) {
      if (available.has(m) && available.has(m + semitones)) lows.push(m);
    }
    if (lows.length) byInterval.set(semitones, lows);
  }
  return byInterval;
}

/**
 * Pick a question: a random interval first (so each ticked interval is
 * equally likely, however many places it fits), then a random low note.
 * Avoids repeating `previous` exactly when there's any alternative.
 * Returns null if nothing fits.
 */
export function pickQuestion(settings, previous = null, random = Math.random) {
  const byInterval = candidates(settings);
  const options = [];
  for (const [semitones, lows] of byInterval) {
    for (const lowMidi of lows) options.push({ semitones, lowMidi });
  }
  if (!options.length) return null;
  const isRepeat = (q) =>
    previous && q.semitones === previous.semitones && q.lowMidi === previous.lowMidi;
  const fresh = options.length > 1 ? options.filter((q) => !isRepeat(q)) : options;

  const semitoneChoices = [...new Set(fresh.map((q) => q.semitones))];
  const semitones = semitoneChoices[Math.floor(random() * semitoneChoices.length)];
  const lows = fresh.filter((q) => q.semitones === semitones);
  const { lowMidi } = lows[Math.floor(random() * lows.length)];
  const descending = settings.direction === "mixed" && random() < 0.5;
  return { semitones, lowMidi, highMidi: lowMidi + semitones, descending };
}

const QUALITIES = { P: "Perfect", M: "Major", m: "Minor" };
const ORDINALS = ["", "unison", "2nd", "3rd", "4th", "5th", "6th", "7th", "octave",
  "9th", "10th", "11th", "12th", "13th", "14th", "double octave"];

/** "Major 3rd", "Perfect 5th", "Tritone", "Compound tritone". */
export function fullName(interval) {
  if (interval.name === "A4/d5") return "Tritone";
  if (interval.name === "A11/d12") return "Octave + tritone";
  const ordinal = ORDINALS[interval.number];
  if (interval.number === 8 || interval.number === 15) return ordinal[0].toUpperCase() + ordinal.slice(1);
  return `${QUALITIES[interval.name[0]]} ${ordinal}`;
}
