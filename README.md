# Ear Trainer

An interval ear-training web app that uses real recordings of your own instrument. Each question plays two notes, one after the other and then together, and then shows the interval and how the notes are spelled (e.g. **M3: Bb3 → D4**). You can choose the instrument, note range, intervals, direction, and timing. Settings are saved in the browser.

**Chord mode** ("Over a chord") plays a piano chord, then your instrument enters on top while the chord rings, and shows the note's interval above the chord's root (e.g. **m7: G over A minor**). The chords either come from a major key (its seven triads, with the top note always in the key and a I–IV–V–I cadence first), or you fix one chord (any root; major, minor, diminished, augmented, or a 7th chord) and any interval can go on top. See [docs/chord-mode.md](docs/chord-mode.md) for how it was planned.

It's a static site (plain HTML/JS/CSS and the Web Audio API) with no build step and no backend. The styling uses [daisyUI](https://daisyui.com) 5.7.47 and the [Tailwind CSS](https://tailwindcss.com) 4.3.3 browser build, both stored in `vendor/` so the app works offline. It currently ships with an oboe and a piano. For the story of how it was built, see [docs/process.md](docs/process.md).

## Running locally

```sh
npm start        # serves the folder at http://localhost:8123
npm test         # runs the interval/spelling tests (Node's built-in runner)
```

`npm start` just runs `python3 -m http.server 8123`. Any static server works, but the page has to be served over HTTP, because opening `index.html` directly from disk can't load the samples.

To deploy, run `scripts/deploy.sh user@host:/path/to/site --dry-run` first, then run it again without `--dry-run`. It uploads only the files the site needs.

## The piano

The chord-mode piano is the [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) by Alexander Holm, licensed [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/). `scripts/fetch_piano.sh` downloads it (as hosted for Tone.js), cuts each note to 5 seconds of mono WAV, and adds it to `samples/instruments.json`. Salamander has a note every minor third from C2 to C6; the app pitch-shifts the nearest sample for the notes in between. The piano can also be chosen as the instrument in interval mode.

## Adding an instrument

1. **Record** an ascending chromatic scale played slowly, with a short silence between notes. Bad notes are fine: just play them again. The slicer keeps the last take of each note and skips wrong notes and noise.
2. **Save it** as `samples/<name>.wav`, e.g. `samples/clarinet.wav`. The file name becomes the instrument's name in the app.
3. **Check the slicing** with a dry run. Pass the first note you played as `--start`:

   ```sh
   uv run scripts/slice_samples.py samples/clarinet.wav --start E3 --dry-run
   ```

   This prints how every segment was labelled, its tuning, and any missing notes. If notes run together or quiet notes get skipped, adjust `--threshold` (dB below the loudest point that counts as silence, 35 by default).
4. **Slice it** by running the same command without `--dry-run`. This writes one file per note (`clarinet-052-E3.wav`, …) and adds the instrument to `samples/instruments.json`.
5. **Reload the app.** The new instrument appears in the Instrument dropdown.

The script needs [uv](https://docs.astral.sh/uv/), which installs its Python dependencies (numpy, soundfile) automatically. Run `uv run scripts/slice_samples.py --help` to see all options, including `--name` and `--out`.
