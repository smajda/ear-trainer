import { test } from "node:test";
import assert from "node:assert/strict";
import { INTERVALS, fullName, spellInterval, noteName, keyName, candidates, pickQuestion } from "../js/theory.js";

const spell = (low, semitones) => {
  const { interval, low: l, high: h } = spellInterval(low, semitones);
  return `${interval.name} ${noteName(l, { ascii: true })}-${noteName(h, { ascii: true })}`;
};

test("intervals table covers P1 to P15", () => {
  assert.equal(INTERVALS.length, 25);
  INTERVALS.forEach((iv, i) => assert.equal(iv.semitones, i));
});

test("white-key intervals spell by letter count", () => {
  assert.equal(spell(60, 4), "M3 C4-E4");
  assert.equal(spell(60, 3), "m3 C4-Eb4");
  assert.equal(spell(64, 7), "P5 E4-B4");
  assert.equal(spell(71, 1), "m2 B4-C5");
  assert.equal(spell(60, 12), "P8 C4-C5");
  assert.equal(spell(60, 16), "M10 C4-E5");
  assert.equal(spell(62, 24), "P15 D4-D6");
  assert.equal(spell(60, 0), "P1 C4-C4");
});

test("black-key low notes avoid double accidentals", () => {
  assert.equal(spell(70, 4), "M3 Bb4-D5"); // not A# - C##
  assert.equal(spell(68, 4), "M3 Ab4-C5"); // not G# - B#
  assert.equal(spell(61, 3), "m3 C#4-E4"); // not Db - Fb
  assert.equal(spell(58, 7), "P5 Bb3-F4");
  assert.equal(spell(66, 11), "M7 Gb4-F5"); // not F# - E#
});

test("ties use the common key-signature spelling", () => {
  // both spellings need one accidental on top; prefer C#, Eb, F#, Ab, Bb
  assert.equal(spell(61, 5), "P4 C#4-F#4");
  assert.equal(spell(63, 2), "M2 Eb4-F4");
  assert.equal(spell(70, 5), "P4 Bb4-Eb5");
});

test("tritones are labelled both ways and spelled augmented", () => {
  assert.equal(spell(60, 6), "A4/d5 C4-F#4");
  assert.equal(spell(65, 6), "A4/d5 F4-B4");
  assert.equal(spell(60, 18), "A11/d12 C4-F#5");
});

test("octave changes at C", () => {
  assert.equal(spell(59, 1), "m2 B3-C4");
  assert.equal(spell(58, 4), "M3 Bb3-D4");
  assert.equal(spell(61, 11), "M7 Db4-C5"); // not C#4 - B#4
});

test("unicode names and key names", () => {
  assert.equal(noteName(spellInterval(70, 4).low), "B♭4");
  assert.equal(keyName(70), "A♯4/B♭4");
  assert.equal(keyName(60), "C4");
});

const oboe = new Set(Array.from({ length: 29 }, (_, i) => 58 + i));

test("candidates stay inside the range", () => {
  const c = candidates({ intervals: [7, 24], low: 60, high: 72, available: oboe });
  assert.deepEqual(c.get(7), [60, 61, 62, 63, 64, 65]);
  assert.equal(c.has(24), false); // two octaves don't fit in one
});

test("candidates need samples for both notes", () => {
  const c = candidates({ intervals: [2], low: 50, high: 62, available: oboe });
  assert.deepEqual(c.get(2), [58, 59, 60]);
});

test("pickQuestion picks intervals evenly, not by how often they fit", () => {
  const settings = { intervals: [1, 24], low: 58, high: 86, available: oboe, direction: "up" };
  const counts = { 1: 0, 24: 0 };
  let prev = null;
  for (let i = 0; i < 4000; i++) {
    prev = pickQuestion(settings, prev);
    counts[prev.semitones]++;
  }
  // m2 fits 28 places, P15 fits 5; both should still come up about half the time
  assert.ok(Math.abs(counts[1] - 2000) < 200, JSON.stringify(counts));
});

test("pickQuestion never repeats the same question twice in a row", () => {
  const settings = { intervals: [7], low: 60, high: 68, available: oboe, direction: "up" };
  let prev = null;
  for (let i = 0; i < 500; i++) {
    const q = pickQuestion(settings, prev);
    if (prev) assert.notEqual(q.lowMidi, prev.lowMidi);
    prev = q;
  }
});

test("pickQuestion repeats when there's only one option", () => {
  const settings = { intervals: [7], low: 60, high: 67, available: oboe, direction: "up" };
  const q = pickQuestion(settings, { semitones: 7, lowMidi: 60 });
  assert.equal(q.lowMidi, 60);
});

test("pickQuestion returns null when nothing fits", () => {
  const settings = { intervals: [12], low: 60, high: 70, available: oboe, direction: "up" };
  assert.equal(pickQuestion(settings), null);
  assert.equal(pickQuestion({ ...settings, intervals: [] }), null);
});

test("direction", () => {
  const base = { intervals: [7], low: 58, high: 86, available: oboe };
  for (let i = 0; i < 50; i++) assert.equal(pickQuestion({ ...base, direction: "up" }).descending, false);
  const mixed = Array.from({ length: 400 }, () => pickQuestion({ ...base, direction: "mixed" }).descending);
  const down = mixed.filter(Boolean).length;
  assert.ok(down > 120 && down < 280, `descending ${down}/400`);
});

test("full names", () => {
  const names = INTERVALS.map(fullName);
  assert.deepEqual(names.slice(0, 13), [
    "Perfect unison", "Minor 2nd", "Major 2nd", "Minor 3rd", "Major 3rd", "Perfect 4th", "Tritone",
    "Perfect 5th", "Minor 6th", "Major 6th", "Minor 7th", "Major 7th", "Octave",
  ]);
  assert.equal(names[16], "Major 10th");
  assert.equal(names[18], "Octave + tritone");
  assert.equal(names[24], "Double octave");
});
