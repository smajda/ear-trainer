import { test } from "node:test";
import assert from "node:assert/strict";
import { pickChordQuestion } from "../js/chords.js";
import { abc, describe, keyboard, notesRow } from "../js/display.js";

const oboe = new Set(Array.from({ length: 29 }, (_, i) => 58 + i));
const only = (midi) => ({ low: midi, high: midi, available: oboe });

// one chord question with the top note pinned to a single MIDI note
const chordQ = (settings, topMidi, semitones) =>
  pickChordQuestion({ ...settings, intervals: [semitones], ...only(topMidi) });
const fixed = (chordRoot, chordType) => ({ chordSource: "fixed", chordRoot, chordType });
const inKey = (key) => ({ chordSource: "key", key });

const row = (d) => notesRow(d).map((i) => `${i.name}${i.role === "top" ? "*" : i.role === "lower" ? "°" : ""}${i.outside ? "_" : ""}`).join(" ");

test("titles", () => {
  const d = describe(chordQ(fixed(0, "min"), 77, 5), "chord");
  assert.equal(d.title, "Perfect 4th");
  assert.equal(d.subtitle, "F over C minor");
  assert.equal(describe(chordQ(fixed(0, "maj"), 72, 12), "chord").title, "Root (octave)");
  const iv = describe({ lowMidi: 70, semitones: 4, highMidi: 74, descending: true }, "intervals");
  assert.equal(iv.title, "Major 3rd, descending");
  assert.equal(iv.subtitle, "D5 → B♭4");
});

test("notes row: fixed chords use a scale that fits the chord", () => {
  assert.equal(row(describe(chordQ(fixed(0, "min"), 77, 5), "chord")), "C° D E♭° F* G° A♭ B♭");
  assert.equal(row(describe(chordQ(fixed(7, "dom7"), 72, 5), "chord")), "G° A B° C* D° E F°");
  assert.equal(row(describe(chordQ(fixed(11, "dim"), 71, 12), "chord")), "B* C D° E F° G A");
});

test("notes row: a top note outside the scale is slotted in and marked", () => {
  // tritone over C minor is F♯ (augmented 4th), between F and G
  assert.equal(row(describe(chordQ(fixed(0, "min"), 66, 6), "chord")), "C° D E♭° F F♯*_ G° A♭ B♭");
  // major 7th over C minor: B after B♭
  assert.equal(row(describe(chordQ(fixed(0, "min"), 71, 11), "chord")), "C° D E♭° F G° A♭ B♭ B*_");
});

test("notes row: key mode shows the key's notes from the chord's root", () => {
  // A minor in C, G on top
  assert.equal(row(describe(chordQ(inKey(0), 67, 10), "chord")), "A° B C° D E° F G*");
  // D diminished in E♭ (vii°), A♭ on top
  assert.equal(row(describe(chordQ(inKey(3), 68, 6), "chord")), "D° E♭ F° G A♭* B♭ C");
});

test("notes row: interval mode uses the low note's major scale", () => {
  const d = (low, semitones) => describe({ lowMidi: low, semitones, highMidi: low + semitones, descending: false }, "intervals");
  assert.equal(row(d(70, 4)), "B♭° C D* E♭ F G A");
  assert.equal(row(d(60, 3)), "C° D E♭*_ E F G A B");
});

test("staff: chord mode is a grand staff with the key signature", () => {
  const am = abc(describe(chordQ(inKey(0), 67, 10), "chord"));
  assert.match(am, /K:C\n\[V:1\] z2 G2 \|\]\n\[V:2\] \[A,,C,E,\]4 \|\]/);
  // in E♭, notes in the key need no accidentals
  const eb = abc(describe(chordQ(inKey(3), 68, 6), "chord"));
  assert.match(eb, /K:Eb\n\[V:1\] z2 A2 \|\]\n\[V:2\] \[D,F,A,\]4 \|\]/);
  // fixed chords write every accidental, naturals included where needed
  const cm = abc(describe(chordQ(fixed(0, "min"), 66, 6), "chord"));
  assert.match(cm, /K:C\n\[V:1\] z2 \^F2 \|\]\n\[V:2\] \[C,_E,G,\]4 \|\]/);
});

test("staff: interval mode plays each note, then both", () => {
  const d = (low, semitones, descending = false) =>
    abc(describe({ lowMidi: low, semitones, highMidi: low + semitones, descending }, "intervals"));
  assert.match(d(70, 4), /K:C clef=treble\n_B d \[_Bd\]2 \|\]/);
  assert.match(d(70, 4, true), /d _B \[_Bd\]2/);
  assert.match(d(72, 12), /c c' \[cc'\]2/);
});

test("keyboard spans whole octaves around the marked notes", () => {
  const { from, to, marks } = keyboard(describe(chordQ(fixed(0, "min"), 77, 5), "chord"));
  assert.equal(from, 48); // C3
  assert.equal(to, 83); // B5
  assert.deepEqual([...marks], [[48, "lower"], [51, "lower"], [55, "lower"], [77, "top"]]);
});
