// What the answer shows: the titles, and the data behind the staff, keyboard
// and notes views. No DOM here, so it can be tested with `node --test`.

import { LETTERS, fullName, spellInterval } from "./theory.js";
import { KEYS, MAJOR_SCALE, chordName, mod12, pitchName, spellAt, tonicOf } from "./chords.js";

// Scales as [semitones above the root, letter number], for a fixed chord,
// where there's no key. Each is the scale usually played over that chord.
const MAJOR = MAJOR_SCALE.map((s, i) => [s, i + 1]);
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10].map((s, i) => [s, i + 1]);
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10].map((s, i) => [s, i + 1]);
const LOCRIAN = [0, 1, 3, 5, 6, 8, 10].map((s, i) => [s, i + 1]);
const WHOLE_TONE = [0, 2, 4, 6, 8, 10].map((s, i) => [s, i + 1]);
const CHORD_SCALES = {
  maj: MAJOR, maj7: MAJOR,
  min: NATURAL_MINOR, min7: NATURAL_MINOR,
  dom7: MIXOLYDIAN,
  dim: LOCRIAN, m7b5: LOCRIAN,
  aug: WHOLE_TONE,
};

/** The key's scale, starting from one of its notes (that note's mode). */
function modeOf(key, rootPc) {
  const degree = MAJOR_SCALE.indexOf(mod12(rootPc - key));
  return MAJOR_SCALE.map((_, i) => [mod12(MAJOR_SCALE[(degree + i) % 7] - MAJOR_SCALE[degree]), i + 1]);
}

/**
 * Everything the answer views need, for either mode:
 * - `title`, `subtitle`: "Perfect 4th", "F over C minor" (or "B♭3 → D4")
 * - `lower`: the chord's notes (or the interval's low note), drawn in gray
 * - `top`: the note on top (or the high note), drawn in the highlight colour
 * - `root`, `scale`: where the notes row starts and which scale it shows
 * - `key`: the key signature's tonic pitch class, or null for none
 * Notes are { midi, note } with `note` spelled as { letter, accidental, octave }.
 */
export function describe(question, mode) {
  if (mode === "chord") {
    const { interval, chord, chordMidis, chordNotes, topMidi, top, key } = question;
    const root = chordNotes[0];
    return {
      mode,
      title: interval.semitones === 12 ? "Root (octave)" : fullName(interval),
      subtitle: `${pitchName(top)} over ${chordName(chord)}`,
      lower: chordMidis.map((midi, i) => ({ midi, note: chordNotes[i] })),
      top: { midi: topMidi, note: top },
      root,
      scale: key == null ? CHORD_SCALES[chord.type] : modeOf(key, chord.rootPc),
      key,
    };
  }
  const { interval, low, high } = spellInterval(question.lowMidi, question.semitones);
  const [first, second] = question.descending ? [high, low] : [low, high];
  return {
    mode,
    title: fullName(interval) + (question.descending ? ", descending" : ""),
    subtitle: `${noteText(first)} → ${noteText(second)}`,
    lower: [{ midi: question.lowMidi, note: low }],
    top: { midi: question.highMidi, note: high },
    descending: question.descending,
    root: low,
    scale: MAJOR,
    key: null,
  };
}

const UNICODE = { "-2": "𝄫", "-1": "♭", 0: "", 1: "♯", 2: "𝄪" };
const noteText = (n) => `${LETTERS[n.letter]}${UNICODE[n.accidental]}${n.octave}`;

/**
 * The notes row: the scale from the root, with the chord's notes marked
 * "lower" and the top note marked "top" (top wins if it's both). A top note
 * outside the scale is slotted in where it falls and marked `outside`.
 */
export function notesRow(d) {
  const rootPc = mod12(d.lower[0].midi); // the chord's root, or the low note
  const lowerPcs = new Set(d.lower.map((n) => mod12(n.midi)));
  const topPc = mod12(d.top.midi);
  const items = d.scale.map(([semitones, number]) => {
    const note = spellAt(60 + rootPc + semitones, (d.root.letter + number - 1) % 7);
    const pc = mod12(rootPc + semitones);
    const isTop = pc === topPc;
    return {
      name: pitchName(isTop ? d.top.note : note), // the top note keeps its own spelling
      role: isTop ? "top" : lowerPcs.has(pc) ? "lower" : null,
      outside: false,
      semitones,
    };
  });
  if (!items.some((item) => item.role === "top")) {
    const semitones = mod12(topPc - rootPc);
    const at = items.findIndex((item) => item.semitones > semitones);
    items.splice(at < 0 ? items.length : at, 0, { name: pitchName(d.top.note), role: "top", outside: true, semitones });
  }
  return items.map(({ semitones, ...item }) => item);
}

// ---- staff (ABC notation, drawn by abcjs) ----

/** The accidental the key signature gives each letter (all 0 without a key). */
function signature(key) {
  const acc = Array(7).fill(0);
  if (key == null) return acc;
  const tonic = tonicOf(key);
  MAJOR_SCALE.forEach((s, i) => {
    const note = spellAt(60 + key + s, (tonic.letter + i) % 7);
    acc[note.letter] = note.accidental;
  });
  return acc;
}

const ABC_ACCIDENTALS = { "-2": "__", "-1": "_", 0: "=", 1: "^", 2: "^^" };

/** One note in ABC: C4 is "C", C5 "c", C6 "c'", C3 "C,". */
function abcNote(note, sig) {
  const accidental = note.accidental === sig[note.letter] ? "" : ABC_ACCIDENTALS[note.accidental];
  const letter = LETTERS[note.letter];
  const pitch = note.octave >= 5
    ? letter.toLowerCase() + "'".repeat(note.octave - 5)
    : letter + ",".repeat(4 - note.octave);
  return accidental + pitch;
}

/**
 * The answer as one bar of ABC. Chord mode: a grand staff with the chord as
 * a whole note in the bass and the top note on beat 3 in the treble. Interval
 * mode: one staff with each note, then both together.
 */
export function abc(d) {
  const sig = signature(d.key);
  const n = (x) => abcNote(x.note, sig);
  const key = d.key == null ? "C" : KEYS[d.key];
  if (d.mode === "chord") {
    return [
      "X:1", "M:none", "L:1/4", "%%staves {1 2}",
      "V:1 clef=treble", "V:2 clef=bass", `K:${key}`,
      `[V:1] z2 ${n(d.top)}2 |]`,
      `[V:2] [${d.lower.map(n).join("")}]4 |]`,
    ].join("\n");
  }
  const [low, high] = [d.lower[0], d.top];
  const [first, second] = d.descending ? [high, low] : [low, high];
  // bass clef only if both notes sit below middle C's neighbourhood
  const clef = high.midi < 57 ? "bass" : "treble";
  return ["X:1", "M:none", "L:1/4", `K:${key} clef=${clef}`, `${n(first)} ${n(second)} [${n(low)}${n(high)}]2 |]`].join("\n");
}

// ---- keyboard ----

/**
 * The keys to draw (whole octaves, from the C below the lowest note to the B
 * above the highest) and which are marked.
 */
export function keyboard(d) {
  const marks = new Map(d.lower.map((n) => [n.midi, "lower"]));
  marks.set(d.top.midi, "top");
  const midis = [...marks.keys()];
  const from = Math.min(...midis) - mod12(Math.min(...midis));
  const to = Math.max(...midis) - mod12(Math.max(...midis)) + 11;
  return { from, to, marks };
}
