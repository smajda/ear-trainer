// Loads an instrument's samples and plays questions with Web Audio.

const GAP = 0.2;       // silence between the three parts (s)
const RELEASE = 0.15;  // fade-out after each note is cut (s)
const CHORD_LENGTH = 1.5; // chord lasts this many times the note length
const PIANO_LEVEL = 0.8;  // per chord note; the piano samples are quieter than the oboe

export class Player {
  constructor(baseUrl = "samples/") {
    this.baseUrl = baseUrl;
    // iOS mutes Web Audio in silent mode unless the page declares playback.
    if (navigator.audioSession) navigator.audioSession.type = "playback";
    this.ctx = new AudioContext();
    this.buffers = new Map(); // instrument → Map(midi → AudioBuffer)
    this.playing = [];
  }

  /** Fetch and decode all of an instrument's notes (cached). */
  async load(instrument, files) {
    if (this.buffers.has(instrument)) return this.buffers.get(instrument);
    const entries = await Promise.all(
      Object.entries(files).map(async ([midi, file]) => {
        const res = await fetch(this.baseUrl + encodeURIComponent(file));
        if (!res.ok) throw new Error(`couldn't load ${file} (${res.status})`);
        return [Number(midi), await this.ctx.decodeAudioData(await res.arrayBuffer())];
      }),
    );
    const notes = new Map(entries);
    this.buffers.set(instrument, notes);
    return notes;
  }

  /** Browsers only allow audio after a user gesture; call from a click. */
  unlock() {
    if (this.ctx.state !== "running") return this.ctx.resume();
  }

  /**
   * Play first note, second note, then both together. Returns how many
   * seconds until the chord finishes.
   */
  play(instrument, question, noteLength) {
    this.stop();
    const notes = this.buffers.get(instrument);
    const [first, second] = question.descending
      ? [question.highMidi, question.lowMidi]
      : [question.lowMidi, question.highMidi];
    const t0 = this.ctx.currentTime + 0.05;
    const t1 = t0 + noteLength + GAP;
    const t2 = t1 + noteLength + GAP;
    const chordLength = noteLength * CHORD_LENGTH;
    this.#note(notes, first, t0, noteLength, 1);
    this.#note(notes, second, t1, noteLength, 1);
    this.#note(notes, first, t2, chordLength, 0.7);
    this.#note(notes, second, t2, chordLength, 0.7);
    return t2 + chordLength + RELEASE - this.ctx.currentTime;
  }

  /**
   * Chord mode: optionally a cadence of piano chords, then the question's
   * chord, with the top note entering a note length later while the chord
   * rings. Returns how many seconds until it finishes.
   */
  playChord(instrument, question, noteLength, cadence = []) {
    this.stop();
    const piano = this.buffers.get("piano");
    let t = this.ctx.currentTime + 0.05;
    for (const chord of cadence) {
      for (const midi of chord) this.#note(piano, midi, t, noteLength, PIANO_LEVEL);
      t += noteLength + GAP;
    }
    if (cadence.length) t += noteLength; // a beat's rest before the question
    const topLength = noteLength * CHORD_LENGTH;
    for (const midi of question.chordMidis) this.#note(piano, midi, t, noteLength + topLength, PIANO_LEVEL);
    this.#note(this.buffers.get(instrument), question.topMidi, t + noteLength, topLength, 1);
    return t + noteLength + topLength + RELEASE - this.ctx.currentTime;
  }

  stop() {
    for (const src of this.playing) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    this.playing = [];
  }

  /**
   * Play `midi` from an instrument's samples. If there's no sample for that
   * note, the nearest one is pitch-shifted (the piano has one every 3 notes).
   */
  #note(notes, midi, when, length, level) {
    let sampled = midi;
    for (let d = 1; !notes.has(sampled); d++) {
      sampled = notes.has(midi - d) ? midi - d : midi + d;
    }
    const buffer = notes.get(sampled);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 2 ** ((midi - sampled) / 12);
    const gain = this.ctx.createGain();
    // the samples are only a few seconds long, so the note can't be held longer than that
    const end = when + Math.min(length, buffer.duration / src.playbackRate.value - RELEASE);
    gain.gain.setValueAtTime(level, when);
    gain.gain.setValueAtTime(level, end);
    gain.gain.linearRampToValueAtTime(0, end + RELEASE);
    src.connect(gain).connect(this.ctx.destination);
    src.start(when);
    src.stop(end + RELEASE);
    src.onended = () => {
      this.playing = this.playing.filter((s) => s !== src);
    };
    this.playing.push(src);
  }
}
