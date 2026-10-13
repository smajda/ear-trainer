# How this project started

A record of the first working session: slicing the oboe recording into samples, and planning the ear-training app. User messages and the planning questions are quoted exactly; the narrative in between is a summary.

## 1. Slicing the oboe recording

> i want to build an ear training app but i want to use real samples of my own instrument to do so. samples/oboe.wav is a recording of the chromatic scale played slowly on an oboe. some notes are repeated if the first take was bad. Can you chop it up into individual samples of each slice? ie samples/oboe-A.wav, oboe-A#.wav, etc?

`samples/oboe.wav` is about 99 seconds of 44.1 kHz, 16-bit stereo audio. The first approach was a frame-by-frame pitch tracker. It mostly worked, but it made harmonic errors on some notes: C#4 read as F6 (its 5th harmonic), and E4 as E6. Splitting the recording at the silences between notes, then estimating one pitch per note, worked better. Any remaining harmonic mix-ups were resolved by knowing the notes go up the chromatic scale one semitone at a time.

Looking closely at the recording turned up a few things:

- The first 4 seconds are quiet breath or tuning sounds, not a note.
- The first A#3 starts with a short cracked attack at about 771 Hz before the real note settles in.
- At about 50s, a wrong F5 comes right after D#5, and then the scale restarts from D#5.
- Repeated takes: B4, F#5 and C#6 have two each; C#5, A5 and D6 have three each.

Following the note that bad first takes were re-recorded, the **last take** of each pitch was kept. The result is 29 samples from A#3 to D6. Octave numbers had to go in the file names, because the range covers about 2½ octaves. Each sample was then independently re-checked to confirm its pitch matches its name.

## 2. Making the slicer reusable

> keep the slicing scripts i will want to do other instruments

The one-off scripts had the oboe's take times hard-coded, so they were turned into one general tool: `scripts/slice_samples.py`, run with `uv run` and its dependencies declared inside the script. You give it the first note of the scale (`--start`). It finds the notes by splitting at silences, then labels them by walking up the chromatic scale. Each note is compared with its neighbouring semitones, so repeated takes are detected and noise or wrong notes are skipped. It keeps the last take of each note and cuts off any off-pitch start. `--dry-run` prints how every sound was labelled. Run on the oboe recording, it picked exactly the same 29 takes as the manual pass.

While that was running, two messages arrived about naming:

> you can use an 's' instead of '#' in the names

> the naming is confusing bc i want it to sort. can you do 'oboe-A-As.wav', etc

The example `oboe-A-As.wav` could be read more than one way, so I asked:

**I want to check what `oboe-A-As.wav` means, because the recording covers about 2½ octaves (there are three A#s). Which file name format do you want?**

- ✅ **MIDI number prefix (Recommended)**: e.g. oboe-058-As3.wav. A plain `ls` lists them in pitch order and the note stays readable.
  ```
  oboe-058-As3.wav
  oboe-059-B3.wav
  oboe-060-C4.wav
  oboe-061-Cs4.wav
  ...
  oboe-070-As4.wav
  ...
  oboe-086-D6.wav
  ```
- **Octave, then note**: e.g. oboe-3-As.wav. Groups files by octave, but inside an octave they sort alphabetically, not by pitch.
  ```
  oboe-3-As.wav
  oboe-3-B.wav
  oboe-4-A.wav
  oboe-4-As.wav
  oboe-4-B.wav
  oboe-4-C.wav
  oboe-4-Cs.wav
  ...
  ```
- **Letter group, then note**: e.g. oboe-A-As4.wav. Keeps A and A# together and adds the octave at the end.
  ```
  oboe-A-A4.wav
  oboe-A-A5.wav
  oboe-A-As3.wav
  oboe-A-As4.wav
  oboe-A-As5.wav
  oboe-B-B3.wav
  ...
  ```

The samples were renamed to `oboe-058-As3.wav` … `oboe-086-D6.wav`. The number at the front is the MIDI note number, so the files sort in pitch order, and `s` means sharp, which keeps `#` out of the names (in a URL, `#` starts a fragment).

> cool, commit this

This became the repo's first commit: the script, the original recording and the 29 slices.

## 3. Planning the app

> ok so now i want to build a simple ear training app. i want the user to be able to select a range of intervals (fifths, minor thirds, etc) and notes, hugh and low, that they want to study. and then have quizzes that randomly play the notes together (low note, then high note, then together as a chord) and then, a second or two later, show the answer for the interval and the notes played.
>
> ask me questions until we have a more full plan

The questions came in four rounds. Each round's answers shaped the next: choosing note spellings that fit the interval meant deciding how black-key notes and the tritone should be named, and choosing stats without answer buttons raised the question of where a right/wrong signal would come from. (✅ = chosen answer.)

### Round 1: platform and quiz flow

**What should the app run as?**

- ✅ **Static web app (Recommended)**: Plain HTML/JS using the Web Audio API, served from the repo folder. It runs in any browser, including on your phone, and needs no backend.
  ```
  ear-trainer/
    index.html
    app.js
    style.css
    samples/*.wav

  # dev:  python3 -m http.server
  # host: GitHub Pages / Netlify
  ```
- **Web app with a framework**: React or Svelte with Vite. More structure if the app is going to grow, but it adds a build step.
- **Desktop/CLI tool**: Python script that plays audio locally. Quickest to hack on, but awkward to use on a phone.

**During a quiz, should you answer before the reveal, or just listen?**

- ✅ **Just listen, then reveal**: Exactly what you described: the notes play, then the answer appears after a pause. You check yourself in your head, and there's no scoring.
- **Optional answer buttons**: Interval buttons appear while the notes play. If you click one before the reveal, it's marked right or wrong and counted; if you don't, the answer just shows.
- **Must answer**: The quiz waits for you to pick an interval, then reveals and scores it. More like a test.

**After the answer is shown, what happens next?**

- **Auto-advance**: A few seconds after the reveal, the next question plays by itself. Hands-free, so you can practise with your instrument in hand.
- **Press for next**: Nothing happens until you press Next (or the spacebar). You can take as long as you like.
- ✅ **Toggle between both**: A setting switches between the two modes.

**How should picking notes work?**

- ✅ **Lowest and highest allowed note**: Choose a range, e.g. C4 to G5. Both notes of every interval fall inside it.
  ```
  Range: [C4 ▾] to [G5 ▾]
  Intervals: ☑ m3 ☑ M3 ☑ P5

  Possible question: E4 → G#4 (M3)
  never: A5 → C6 (out of range)
  ```
- **Pick specific notes**: Tick individual notes (e.g. just F4, G4, Bb4) and every question uses only those notes.
  ```
  Notes: ☑F4 ☑G4 ☑Bb4 ☐B4 ...
  Intervals: ☑ m3 ☑ M3 ☑ P5

  Only intervals that fit between
  the ticked notes can come up.
  ```
- **Pick the bottom notes**: Tick which notes can be the low note. The high note is whatever the interval gives, as long as the oboe can play it.
  ```
  Low notes: ☑C4 ☑D4 ☑E4
  Intervals: ☑ P5

  Possible: C4→G4, D4→A4, E4→B4
  ```

### Round 2: musical details

**Which intervals should be available to choose from?**

- **Unison to octave**: The 13 intervals from P1 to P8 (m2, M2, m3, … M7, P8). Your current samples span about 2½ octaves, so these fit easily.
- ✅ **Up to two octaves**: Adds compound intervals: m9, M9, m10 … P15. These are only possible over a wide range of notes.
- **Octave, no unison**: m2 to P8. Unison is easy to hear, so it's left out.

**How should note names be spelled in the answer?**

- **Flats (Bb, Eb)**: Like you'd read them on oboe music: Bb3, Eb4, Ab4. One consistent spelling.
- **Sharps (A#, D#)**: Matches the file names: A#3, D#4, G#4.
- **Both, e.g. A#/Bb**: Shows both names for black-key notes.
- ✅ **Spelled to fit the interval**: Spells the high note so the letters match the interval: a M3 above Bb is D, but an aug2 above Bb is C#. Theory-correct, but you'd need to pick which interval name each distance gets (A4 or d5, etc.).

**How should the three parts of each question be timed? The samples are about 2s long.**

- ✅ **Short notes, configurable (Recommended)**: Default: each note plays for about 1s with a fade, low → high → both together, with short gaps. A setting changes the note length.
  ```
  low   ████░
  high        ████░
  both              ██████░
        0s   1.2s  2.4s   4s → reveal at ~5.5s
  ```
- **Full samples**: Each note plays its whole recording (about 2s). More natural, but each question takes about 7s.
- **Fixed short notes**: Always about 1s per note. Simpler, with no setting.

**What else should the quiz screen have?** (multiple choice)

- ✅ **Replay button**: Plays the current question again, before or after the reveal.
- ✅ **Stats**: Running count of questions, broken down by interval. Without answer buttons it can't track right/wrong, though, so its use is limited.
- ✅ **Remember settings**: Saves your chosen range, intervals and timing in the browser.
- ✅ **Choose instrument**: Instrument dropdown, ready for other instruments once you've sliced their recordings.

### Round 3: follow-ups on spelling and stats

**When the low note is a black key, how should it be spelled? The high note then follows from the interval.**

- ✅ **Pick per question (Recommended)**: Choose whichever spelling keeps the high note simple. For example, a M3 above the black key between A and B is Bb→D, not A#→C##. Avoids double sharps and double flats.
  ```
  M3 above A#/Bb  →  Bb → D     (not A# → C##)
  M3 above G#/Ab  →  Ab → C     (not G# → B#)
  m3 above C#/Db  →  C# → E     (not Db → Fb)
  ```
- **Always flats**: The low note is always Bb, Eb, etc., and the high note gets whatever spelling the interval needs (Db→Fb is possible).
- **Always sharps**: The low note is always A#, D#, etc. (C#→E#, A#→C## are possible).

**Some distances have two common interval names. Which should the app use?**

- ✅ **Standard names, tritone as A4/d5**: m2 M2 m3 M3 P4 then 'A4/d5' for the tritone, then P5 m6 M6 m7 M7 P8, and compound versions after that. The tritone's high note is spelled as an A4.
  ```
  1  m2     7  P5
  2  M2     8  m6
  3  m3     9  M6
  4  M3    10  m7
  5  P4    11  M7
  6  A4/d5 12  P8
  13 m9 … 24 P15
  ```
- **Randomly use both names**: Sometimes 3 semitones is 'm3' (C→Eb) and sometimes 'A2' (C→D#), and the tritone is sometimes A4 and sometimes d5. Teaches the spellings, but you can't tell them apart by ear.
- **Standard names only**: Like the first option, but the tritone is always 'A4'.

**Stats need a right/wrong signal. How should you give one?**

- **Self-grade after reveal**: ✓ / ✗ buttons (or Y/N keys) appear with the answer. Optional, so ignoring them still works. Stats show your success rate per interval.
- **Count only**: No grading; just how often each interval has come up.
- ✅ **Drop stats**: Skip them for now.

**Should the quiz play each interval upward only, as you described, or also downward?**

- **Upward only**: Low note, then high note, then together, every time.
- ✅ **Option for down too**: A setting plays some questions high note first, then low note. The chord is the same either way.

### Round 4: smaller details

The first attempt at this round announced the questions but never actually sent them, so you had to prompt:

> try now

**Should unison (P1, the same note twice) be one of the intervals you can choose?**

- ✅ **Include, unticked by default**: It's available if you want it, but it's off at first.
- **Leave it out**: Intervals start at m2.

**Where will you mostly use the app?**

- ✅ **Both phone and desktop**: Layout adapts to the screen. Big tap targets on phone, keyboard shortcuts (space = next/replay) on desktop.
- **Mainly desktop**: Keyboard-friendly, with a layout aimed at bigger screens.
- **Mainly phone**: Designed for small screens first.

**Which timings should be adjustable in the settings?** (multiple choice)

- ✅ **Note length**: How long each single note plays (default about 1s).
- ✅ **Delay before reveal**: How long after the chord the answer appears (default 1.5s).
- ✅ **Auto-advance delay**: How long the answer stays up before the next question in auto mode (default 3s).

**How should the interval checkboxes be laid out?**

- ✅ **Grid with quick presets**: A checkbox for each of the 24 intervals, plus buttons like 'All in octave', 'Thirds', 'Perfect', 'Clear'.
  ```
  [All ≤8ve] [3rds] [Perfect] [Clear]
  ☐m2 ☐M2 ☑m3 ☑M3 ☐P4 ☐A4/d5
  ☐P5 ☐m6 ☐M6 ☐m7 ☐M7 ☐P8
  ☐m9 ☐M9 ☐m10 ☐M10 ☐P11 ☐A11/d12
  ☐P12 ☐m13 ☐M13 ☐m14 ☐M14 ☐P15
  ```
- **Plain grid**: Just the 24 checkboxes, no presets.

## 4. The resulting plan

- **Platform:** a static web app (HTML/JS/CSS, Web Audio API, no build step) for phone and desktop.
- **Settings:**
  - **Instrument:** a dropdown, fed by an `instruments.json` that the slicer will write.
  - **Note range:** a lowest and highest note.
  - **Intervals:** a P1 to P15 checkbox grid with presets.
  - **Direction:** upward only, or a mix of up and down.
  - **Pacing:** auto-advance, or press for next.
  - **Timing:** note length, delay before the reveal, and auto-advance delay.
  - All settings are saved in the browser.
- **Quiz:**
  1. Pick a random ticked interval and a low note where both notes fit the range.
  2. Play the first note, the second, then both together.
  3. Reveal the interval and the spelled notes (e.g. **M3: Bb3 → D4**).
  4. Wait for Next, or auto-advance.
  - Replay is available throughout, with Space and R as keyboard shortcuts.
- **Spelling:** the high note's letter follows from the interval number. Black-key low notes are spelled however avoids double sharps and flats, and tritones are labelled A4/d5 but spelled as A4.
- **Out of scope for now:** stats and scoring, answer buttons, and any backend.

## 5. Saving this record

> ok, first, can you save a summary of this process in the repo? I want you to include what I said exactly and the questions I responded to exactly, but then fill in a brief narrative about the choices made and what we built.

That produced this document, up to section 4.

## 6. Building the app

> sure commit and then start

Since `main` now had history, the docs were committed on a new `build-app` branch, and the app was built there in the planned order:

1. **Manifest:** the slicer now also writes `samples/instruments.json`, mapping each instrument's MIDI numbers to its files. That's how the app finds instruments without a server to list directories. Re-running it on the oboe recording rewrote the WAVs byte-for-byte.
2. **Interval logic (`js/theory.js`):** the interval table, note spelling, and question picking, with no browser code, so `npm test` (Node's built-in test runner) can check it. Two of the first test expectations turned out to be wrong rather than the code. For an M7 above the F#/Gb key, `Gb → F` is simpler than `F# → E#`, which is exactly the agreed rule. Questions pick an interval first and then a low note, so a wide interval like P15 comes up as often as m2 even though it fits in far fewer places.
3. **Playback (`js/audio.js`):** loads the samples and schedules first note → second note → chord on the audio clock, cutting each note to the chosen length with a short fade.
4. **Interface (`index.html`, `style.css`, `js/app.js`):** the quiz card and the settings panel, saved settings, and keyboard shortcuts. A full interval name was added under the short one (e.g. "Major 6th, descending").
5. **Checking it in a browser:** headless Chromium (via Playwright, installed outside the repo) drove the page. Every played note was traced back to its sample file, so the answers shown could be checked against what was actually played. They all matched. The run also found two bugs, both fixed:
   - After clicking a setting, the control kept keyboard focus, so Space did nothing instead of playing the next question.
   - When no ticked interval fit the range, the warning appeared but the previous answer stayed on screen.

## 7. A port problem

> i get an error at http://localhost:8000/canvas/

> it redirects

The local server never sent that redirect: asking it for `/` directly returned the page. So the browser was redirecting on its own, most likely because of a service worker or cached redirect left by another project that once ran on `localhost:8000`.

> ok pick a different port?

The app moved to port 8123, and `npm start` now uses it.

> ok cool. please commit

> oh and update the process doc

The app was committed on `build-app`, and this section was added.

## 8. Process notes

- **Repeated takes:** the request's own wording ("repeated if the first take was bad") set the rule of keeping the last take.
- **Reading the pitch:** the app's main assumption, that the notes go up one semitone at a time, was also what made the pitch detection reliable.
- **When the questions were asked:** they were only asked where an answer would change what got built: file naming, and the app's design. Smaller choices (e.g. not repeating the same question twice in a row, the `instruments.json` manifest, keyboard shortcuts) were made as defaults and stated in the plan instead.
- **Testing:** the automated browser check could confirm which samples played and when, but not how they sound. Listening is still a manual check.
