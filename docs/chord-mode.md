# Planning chord mode

A record of the session that planned a second quiz mode: a piano chord with a single oboe note on top. User messages and the planning questions are quoted exactly; the narrative in between is a summary.

## 1. The idea

> ok, new project. Inspired by this video, https://www.youtube.com/watch?v=96aUlaJXXyg&t=6s, I want to create a new "Chord mode" for the app where instead of just doing two note intervals, we play a triad and then play a note over that triad. In other words, a C major triad with a B on top and then you identify "major 7th" interval. Some nuances:
>
> 1. it doesn't make sense to use an oboe for the chords. so lets just use a MIDI piano of some kind (i'm not sure what the options are for doing this, help me out) and then the single notes on top are the selected instrument (oboe)
>
> 2. it would be cool to select a key and then have all the tones come within that key. In other words, first it does a C major triad and plays a B on top, but then it plays, say, an A minor triad with a G on top for a minor seventh.
>
> 3. alternatively, keep the chord static: lets do a session with all the intervals on top of the C major triad.
>
> ask me questions to help refine the idea.
>
> lets do what we did before with saving the process summary, but save this process to a new file called docs/chord-mode.

Fetching the video gave only its title, "Ear Training Is Broken — A Juilliard Professor Fixes It". The page had no description or transcript, so the plan is based on the description above.

There were three realistic ways to get a piano sound:

- **Self-hosted samples:** for example the Salamander Grand Piano (free, CC-BY, recorded from a Yamaha C5). A subset goes into `samples/` with the same naming and manifest as the oboe, so it works offline and `deploy.sh` already picks it up.
- **A General MIDI soundfont from a CDN:** loaded at runtime (gleitz's MIDI.js soundfonts through a library like `smplr`). Nothing to store, but the app would depend on a third-party host.
- **Synthesized with Web Audio:** tiny, but it sounds like an electric piano or organ at best.

The questions then came in four rounds. (✅ = chosen answer.)

## 2. Round 1: sound, naming, sequence and structure

**Where should the piano sound for the chords come from?**

- ✅ **Self-hosted samples (Recommended)**: Download Salamander Grand Piano (CC-BY), convert a subset to WAV/MP3 in samples/, and register it in instruments.json. Fits the existing static, no-dependency setup. Piano also becomes selectable as an interval-mode instrument for free.
  ```
  samples/
    piano-048-C3.wav
    piano-051-Ds3.wav   (every 3rd semitone,
    piano-054-Fs3.wav    pitch-shifted to fill
    ...                  the gaps; or every note)
    oboe-058-As3.wav
    instruments.json  ← piano added

  ~2–8 MB extra, works offline
  ```
- **Soundfont from CDN**: Load a General MIDI acoustic grand at runtime from a public CDN (gleitz MIDI.js soundfonts via smplr). Nothing to store, but it depends on a third-party host and its sound quality is middling.
  ```
  import { Soundfont } from
    'https://esm.sh/smplr'

  const piano = new Soundfont(ctx,
    { instrument: 'acoustic_grand_piano' })

  // needs network on every visit
  ```
- **Synthesized**: Build a piano-ish tone with oscillators and an envelope. Zero files, but it won't sound like a piano.

**What is the interval measured from, and how should it be named?**

- ✅ **From root, simple names**: The interval from the chord's root, reduced to within an octave: B over C major = M7, D over C major = M2, even if the D is played above the chord.
  ```
  C major + B  →  M7
  A minor + G  →  m7
  C major + D  →  M2
  C major + F# →  A4
  ```
- **From root, chord-tone names**: How a jazz player would hear it: chord tones and tensions relative to the root (b7, 9, #11, 13). This is closer to what the note does over the chord.
  ```
  C major + B  →  7   (maj7)
  A minor + G  →  b7
  C major + D  →  9
  C major + F# →  #11
  C major + A  →  13
  ```
- **Both**: Show the interval name large, with the chord-tone name under it.
  ```
       M7
    7th of C major
    C E G + B
  ```

**How should a question play?**

- ✅ **Chord, then note over it (Recommended)**: The piano chord starts. After a beat the oboe enters on top while the chord keeps ringing. This mirrors how you'd hear a melody note over harmony.
  ```
  piano  ██████████████░
  oboe        ████████░
         0s   1s       2.5s → reveal
  ```
- **Chord, note, together**: Like interval mode: the chord alone, then the note alone, then both together.
  ```
  piano  ████░         ██████░
  oboe         ████░   ██████░
  ```
- **Together only**: The chord and note start at the same time. Hardest, and the most like hearing a voicing.

**How do you picture the two chord ideas (diatonic in a key vs. one static chord) fitting into the app?**

- ✅ **One mode, chord setting (Recommended)**: A 'Chord mode' toggle, plus a 'Chords' setting: 'Diatonic in key [C ▾]' or 'Fixed chord [C ▾][major ▾]'. Interval checkboxes still choose which intervals over the root can come up.
  ```
  Mode:   ○ Intervals  ● Over a chord
  Chords: ● Diatonic in [C major ▾]
          ○ Fixed  [C ▾] [major ▾]
  Intervals: ☑m2 ☑M2 ... ☑M7
  ```
- **Two separate modes**: 'Key mode' and 'Static chord mode' as separate top-level modes, each with its own settings.
- **Fixed = C major only**: Static mode is always C major (as you described), and only key mode can be changed.

## 3. Round 2: key mode, voicing and the reveal

Choosing intervals by checkbox and also limiting notes to a key meant the two filters could clash: you might tick m7 in C major, where there's no m7 above C. So the first question was how they combine.

**In 'diatonic in key' mode, which notes can go on top?**

- ✅ **Only notes in the key (Recommended)**: Both the chord and the top note come from the key. Ticked intervals that don't occur in the key over a given chord are skipped for that chord (e.g. m7 is possible over ii, iii, V and vi in C, but not over I).
  ```
  Key: C major, ticked: m7, M7

  I   C E G   + B  → M7
  ii  D F A   + C  → m7
  IV  F A C   + E  → M7
  V   G B D   + F  → m7
  (never C + Bb: Bb isn't in C)
  ```
- **Any note**: The chords come from the key, but the top note can be any of the ticked intervals, including ones outside the key (C major + Bb).
- **Setting for both**: A 'Top note: in key / chromatic' toggle.

**Which keys and chords should key mode cover?**

- ✅ **Major keys, all 7 triads**: Pick any major key. Chords are I ii iii IV V vi vii°.
  ```
  Key [C major ▾]
  C  Dm  Em  F  G  Am  B°
  ```
- **Major + minor keys**: Natural minor added (or harmonic, so V is major in minor keys).
- **Pick which degrees**: Checkboxes per scale degree (I, ii, ..., vii°) so you can drill, say, just I, IV and V.
  ```
  Key [C major ▾]
  Chords: ☑I ☑ii ☐iii ☑IV ☑V ☑vi ☐vii°
  ```
- **Major + minor, pick degrees**: Both of the above.

**How should the piano chord be voiced?**

- ✅ **Root position, close (Recommended)**: Root in the bass, 3rd and 5th directly above, sitting below the oboe's range. The root is always clearly audible, which helps you hear intervals from it.
  ```
          oboe: B4
    ---------------
    G3
    E3
    C3   ← root in bass
  ```
- **Root + bass octave**: Same as root position, plus the root doubled an octave lower for a fuller piano sound.
  ```
    G3
    E3
    C3
    C2  ← doubled
  ```
- **Random inversions**: Root, 1st or 2nd inversion, chosen at random. Harder, because the root isn't always in the bass.

**What should the reveal show?**

- ✅ **Interval + chord + notes**: The interval large, then the chord and the spelled notes.
  ```
          m7
     Minor 7th
    G over A minor
    A2 C3 E3 + G4
  ```
- **Also the roman numeral**: In key mode, also show the chord's function in the key.
  ```
          m7
     Minor 7th
   G over Am (vi in C)
    A2 C3 E3 + G4
  ```
- **Interval only**: Just the interval name, like interval mode.

## 4. Round 3: fixed chords, key context and register

**In 'fixed chord' mode, which chord types should be available? (The top note can be any ticked interval here, in or out of a key.)**

- **Major and minor**: Any root, major or minor triad.
  ```
  Fixed [C ▾] [major ▾]
                major
                minor
  ```
- **All four triads**: Major, minor, diminished, augmented.
- ✅ **Triads + 7th chords**: Also maj7, 7, m7, m7b5. A note on top of a 4-note chord is a different, harder exercise.

**In key mode, should the app establish the key first?**

- ✅ **Cadence at session start**: Play I–IV–V–I on piano when you press Start or change key, then go straight to questions.
  ```
  [Start] → C  F  G  C   (piano)
          → q1: Dm + C
          → q2: G + F
          ...
  ```
- **Tonic before each question**: A short I chord before every question, so each chord is heard relative to the key. It takes longer, but keeps the key in your ear.
  ```
  C (tonic) → Dm → + C (oboe)
  ```
- **Optional button**: A 'Play cadence' button you can press whenever you want.
- **No**: Just play the chord and note.

**Where can the oboe note fall relative to the chord?**

- ✅ **Anywhere in range, above chord (Recommended)**: Any note in your selected range that is above the chord's top note. Since answers use simple names, a D5 over C3–E3–G3 is still 'M2'. It uses the full oboe range.
  ```
  range Bb3–D6, chord C3 E3 G3
    B3, B4, B5 → all 'M7'
  ```
- **Within an octave of the root**: The top note sits in the octave just above the chord, so the sounding interval is close to its name. It's easier, but it limits which oboe notes are used, and the chord would have to move up into the oboe's range.

## 5. Round 4: follow-ups

Allowing 7th chords in fixed mode raised the question of whether key mode should have them too. Choosing simple interval names also meant the 24-interval grid had to shrink to one octave.

**Since fixed mode will have 7th chords, should key mode be able to use diatonic 7th chords too?**

- **Yes, as a toggle**: 'Chords: triads / 7ths' in key mode. With 7ths on, C major gives Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5.
  ```
  Key [C major ▾]  Chords: ● triads ○ 7ths
  ```
- ✅ **No, triads only**: Key mode stays as planned. 7th chords are only in fixed mode.

**The interval grid in chord mode only needs the 12 notes within an octave. Should the root itself (the top note doubling the chord's root) be a possible answer?**

- **Yes, as 'P8', unticked by default**: Grid: m2 M2 m3 M3 P4 A4/d5 P5 m6 M6 m7 M7 P8. Like unison in interval mode, it's available but off at first.
  ```
  ☐m2 ☑M2 ☑m3 ☑M3 ☑P4 ☑A4/d5
  ☑P5 ☑m6 ☑M6 ☑m7 ☑M7 ☐P8
  ```
- ✅ **Yes, ticked**: Include the root by default.
- **No**: Leave it out entirely.

## 6. The resulting plan

- **Mode:** a new top-level setting, *Intervals* or *Over a chord*. Interval mode is unchanged.
- **Sound:**
  - Chords are played on a self-hosted piano, sampled from the Salamander Grand Piano (CC-BY, credited in the README).
  - The piano is added to `samples/` and `instruments.json` the same way as the oboe, so it's also available as an instrument in interval mode.
  - The top note uses the selected instrument (oboe).
- **Chords setting:**
  - **Diatonic in key:** any major key, using all seven triads (I ii iii IV V vi vii°). The top note is always in the key. When the mode starts or the key changes, a I–IV–V–I cadence plays on piano first.
  - **Fixed chord:** any root, as a major, minor, diminished or augmented triad, or a maj7, 7, m7 or m7b5 chord. The top note can be any ticked interval, in the key or not.
- **Intervals:** a 12-box grid of simple intervals over the root, m2 … M7 plus P8 (the root on top). All are ticked by default. In key mode, a ticked interval only comes up over chords where the note it gives is in the key.
- **Voicing and register:**
  - The chord is in root position, close voicing, below the oboe's range.
  - The top note is any note in the selected range above the chord's highest note. It's named by its simple interval from the root, whatever octave it's in.
- **Question:**
  1. The piano chord starts.
  2. About a beat later, the oboe note enters on top while the chord keeps ringing.
  3. The answer is revealed, e.g. **m7**, *Minor 7th*, *G over A minor*, *A2 C3 E3 + G4*.
  - The existing replay, pacing and timing settings still apply.
- **Out of scope for now:** minor keys, choosing individual scale degrees, inversions, diatonic 7th chords in key mode, and chord-tone/tension names (9, #11, 13).
