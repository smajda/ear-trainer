import { test } from "node:test";
import assert from "node:assert/strict";
import { noteName } from "../js/theory.js";
import { cadence, chordCandidates, chordChoices, chordName, pickChordQuestion, voice } from "../js/chords.js";

const cname = (chord) => chordName(chord, { ascii: true });
const oboe = new Set(Array.from({ length: 29 }, (_, i) => 58 + i));
const names = (notes) => notes.map((n) => noteName(n, { ascii: true })).join(" ");
const keyMode = (key, intervals) => ({ chordSource: "key", key, intervals, low: 58, high: 86, available: oboe });
const fixed = (chordRoot, chordType, intervals) =>
  ({ chordSource: "fixed", chordRoot, chordType, intervals, low: 58, high: 86, available: oboe });

test("diatonic triads in C and Eb", () => {
  assert.deepEqual(chordChoices({ chordSource: "key", key: 0 }).map(cname),
    ["C major", "D minor", "E minor", "F major", "G major", "A minor", "B diminished"]);
  assert.deepEqual(chordChoices({ chordSource: "key", key: 3 }).map(cname),
    ["Eb major", "F minor", "G minor", "Ab major", "Bb major", "C minor", "D diminished"]);
  assert.deepEqual(chordChoices({ chordSource: "key", key: 6 }).map(cname).at(-1), "E# diminished");
});

test("chords are root position with the root between F2 and E3", () => {
  const [c, , , f, , a] = chordChoices({ chordSource: "key", key: 0 }).map(voice);
  assert.equal(names(c.notes), "C3 E3 G3");
  assert.equal(names(f.notes), "F2 A2 C3");
  assert.equal(names(a.notes), "A2 C3 E3");
  const emaj7 = voice(chordChoices({ chordSource: "fixed", chordRoot: 4, chordType: "maj7" })[0]);
  assert.equal(names(emaj7.notes), "E3 G#3 B3 D#4");
});

test("fixed black-key roots are spelled to keep the chord simple", () => {
  const name = (root, type) => cname(chordChoices({ chordSource: "fixed", chordRoot: root, chordType: type })[0]);
  assert.equal(name(1, "maj"), "Db major");
  assert.equal(name(1, "min"), "C# minor");
  assert.equal(name(8, "min"), "G# minor");
  assert.equal(name(6, "maj"), "F# major");
  assert.equal(name(3, "min"), "Eb minor");
  assert.equal(name(10, "dom7"), "Bb dominant 7th");
});

test("key mode only puts notes from the key on top", () => {
  const c = chordCandidates(keyMode(0, [10, 11]));
  const chordsFor = (s) => [...new Set(c.get(s).map((o) => cname(o.chord)))];
  assert.deepEqual(chordsFor(10), ["D minor", "E minor", "G major", "A minor", "B diminished"]);
  assert.deepEqual(chordsFor(11), ["C major", "F major"]);
});

test("the top note is above the chord, in range, and any octave", () => {
  const c = chordCandidates(fixed(0, "maj", [11]));
  assert.deepEqual(c.get(11).map((o) => o.topMidi), [59, 71, 83]); // B3 B4 B5
  const narrow = chordCandidates({ ...fixed(0, "maj", [11, 12]), low: 60, high: 70 });
  assert.equal(narrow.has(11), false);
  assert.deepEqual(narrow.get(12).map((o) => o.topMidi), [60]); // root on top
});

test("fixed mode allows notes outside any key", () => {
  const c = chordCandidates(fixed(0, "maj", [1, 6, 10]));
  assert.deepEqual([...c.keys()], [1, 6, 10]);
});

test("questions are spelled by key in key mode and by interval in fixed mode", () => {
  // B diminished in C with F on top: F, not E#, even though the label is A4/d5
  const settings = { ...keyMode(0, [6]), low: 65, high: 65 };
  const q = pickChordQuestion(settings);
  assert.equal(cname(q.chord), "B diminished");
  assert.equal(noteName(q.top, { ascii: true }), "F4");
  assert.equal(q.interval.name, "A4/d5");

  const f = pickChordQuestion({ ...fixed(0, "maj", [6]), low: 66, high: 66 }, );
  assert.equal(noteName(f.top, { ascii: true }), "F#4");
  const am = pickChordQuestion({ ...fixed(9, "min", [10]), low: 67, high: 67 });
  assert.equal(`${names(am.chordNotes)} + ${noteName(am.top, { ascii: true })}`, "A2 C3 E3 + G4");
});

test("pickChordQuestion picks intervals evenly and avoids repeats", () => {
  const settings = keyMode(0, [5, 6]); // P4 fits over 6 chords, the tritone only over IV and vii°
  const counts = { 5: 0, 6: 0 };
  let prev = null;
  for (let i = 0; i < 2000; i++) {
    const q = pickChordQuestion(settings, prev);
    if (prev) assert.ok(!(q.topMidi === prev.topMidi && q.chord.rootPc === prev.chord.rootPc));
    counts[q.semitones]++;
    prev = q;
  }
  assert.ok(counts[5] > 800 && counts[6] > 800, JSON.stringify(counts));
});

test("pickChordQuestion returns null when nothing fits", () => {
  assert.equal(pickChordQuestion(keyMode(0, [])), null);
  // the tritones in C are B over F major and F over B diminished; neither is B♭3
  assert.equal(pickChordQuestion({ ...keyMode(0, [6]), low: 58, high: 58 }), null);
});

test("cadence is I IV V I", () => {
  assert.deepEqual(cadence(0), [[48, 52, 55], [41, 45, 48], [43, 47, 50], [48, 52, 55]]);
});
