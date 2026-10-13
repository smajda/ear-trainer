# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "soundfile"]
# ///
"""Chop a recording of an ascending chromatic scale into one WAV per note.

    uv run scripts/slice_samples.py samples/oboe.wav --start A#3

Notes are found by splitting on silence, then labelled by walking up the
chromatic scale from --start. Each note is checked against its neighbouring
semitones, so wrong notes and noise are skipped, and repeated takes are
detected. When a note was played more than once, the LAST take is kept.

Writes <name>-<midi>-<note><octave>.wav next to the input, e.g. oboe-070-As4.wav
(MIDI number first so files sort in pitch order; "s" means sharp).
Also adds the instrument to instruments.json in the output directory, which
the app reads to find what instruments and notes are available.
Use --dry-run to see how every segment was labelled without writing files.
"""

import argparse
import json
import os
import sys

import numpy as np
import soundfile as sf

NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLATS = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}

HOP = 0.005          # energy frame hop (s)
MERGE_GAP = 0.05     # silences shorter than this don't split a note (s)
MIN_NOTE = 0.3       # segments shorter than this are ignored (s)
SKIP_PENALTY = 2.0   # cost of assuming a scale note was never played


def parse_note(s):
    s = s.strip()
    name, octave = s[:-1], int(s[-1])
    name = FLATS.get(name, name)
    if name not in NAMES:
        sys.exit(f"bad note: {s} (use e.g. A#3, Bb3, C4)")
    return NAMES.index(name) + 12 * (octave + 1)


def note_name(m):
    return f"{NAMES[m % 12]}{m // 12 - 1}"


def file_name(prefix, m):
    return f"{prefix}-{m:03d}-{note_name(m).replace('#', 's')}.wav"


def frame_db(x, sr):
    hop = int(sr * HOP)
    n = len(x) // hop
    rms = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1))
    return 20 * np.log10(rms + 1e-9)


def find_segments(mono, sr, below_peak_db):
    """(start, end) sample ranges where the signal is above the threshold."""
    db = np.convolve(frame_db(mono, sr), np.ones(5) / 5, mode="same")
    on = db > db.max() - below_peak_db
    edges = np.flatnonzero(np.diff(np.concatenate([[0], on.astype(int), [0]])))
    runs = edges.reshape(-1, 2).tolist()
    merged = []
    for a, b in runs:
        if merged and (a - merged[-1][1]) * HOP < MERGE_GAP:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    hop = int(sr * HOP)
    return [(a * hop, b * hop) for a, b in merged if (b - a) * HOP >= MIN_NOTE]


class Spectrum:
    """Harmonic evidence for candidate notes in a chunk of audio."""

    def __init__(self, x, sr):
        nfft = max(1 << 15, 1 << int(np.ceil(np.log2(len(x)))))
        self.mag = np.abs(np.fft.rfft(x * np.hanning(len(x)), nfft))
        self.bin_hz = sr / nfft

    def harmonic_sum(self, midi, n_harm=8, tol_cents=40):
        f0 = 440 * 2 ** ((midi - 69) / 12)
        r = 2 ** (tol_cents / 1200)
        total = 0.0
        for h in range(1, n_harm + 1):
            lo, hi = int(f0 * h / r / self.bin_hz), int(f0 * h * r / self.bin_hz) + 1
            if hi >= len(self.mag):
                break
            total += self.mag[lo:hi].max()
        return total

    def note_score(self, midi):
        """log2 of how much more `midi` is present than its neighbour semitones."""
        s = self.harmonic_sum(midi)
        rival = max(self.harmonic_sum(midi - 1), self.harmonic_sum(midi + 1))
        return np.log2((s + 1e-12) / (rival + 1e-12))

    def cents_off(self, midi):
        """Tuning of the strongest harmonic, in cents relative to `midi`."""
        f0 = 440 * 2 ** ((midi - 69) / 12)
        best = (0, 0, 0)
        for h in range(1, 6):
            lo, hi = int(f0 * h * 2 ** (-0.5 / 12) / self.bin_hz), int(f0 * h * 2 ** (0.5 / 12) / self.bin_hz)
            if hi >= len(self.mag):
                break
            k = lo + np.argmax(self.mag[lo:hi])
            if self.mag[k] > best[0]:
                best = (self.mag[k], k, h)
        _, k, h = best
        return 1200 * np.log2(k * self.bin_hz / h / f0) if k else 0.0


def label_segments(scores, start, span):
    """Assign each segment a note (or None) by walking up the scale.

    scores[k][i] is how strongly segment k sounds like note start+i. Each
    segment is either junk, a repeat of the current note, the next semitone,
    or (penalised) a semitone further if a note seems to have been skipped.
    """
    K = len(scores)
    NEG = -1e18
    # state i+1 means "last labelled note was start+i"; state 0 means none yet
    best = np.full((K + 1, span + 1), NEG)
    back = np.zeros((K + 1, span + 1, 2), dtype=int)  # (prev state, label)
    best[0, 0] = 0
    for k in range(K):
        for st in range(span + 1):
            if best[k, st] == NEG:
                continue
            base = best[k, st]
            moves = [(st, -1, 0.0)]  # junk
            if st > 0:
                moves.append((st, st - 1, scores[k][st - 1] - 1))  # repeat
            for step in (1, 2):
                nxt = st + step
                if nxt <= span and (st > 0 or step == 1):
                    pen = SKIP_PENALTY if step == 2 else 0.0
                    moves.append((nxt, nxt - 1, scores[k][nxt - 1] - 1 - pen))
            for nst, lab, gain in moves:
                if base + gain > best[k + 1, nst]:
                    best[k + 1, nst] = base + gain
                    back[k + 1, nst] = (st, lab)
    st = int(np.argmax(best[K]))
    labels = [None] * K
    for k in range(K, 0, -1):
        prev, lab = back[k, st]
        labels[k - 1] = start + lab if lab >= 0 else None
        st = prev
    return labels


def trim(audio, mono, sr, a, b, limit, midi):
    """Tighten a segment to the note, dropping any off-pitch false attack."""
    hop = int(sr * HOP)
    region = mono[a:limit]
    db = frame_db(region, sr)
    pk = db[: (b - a) // hop].max()
    start = max(0, np.flatnonzero(db > pk - 30)[0] * hop - int(0.02 * sr))
    end = min(len(region), (np.flatnonzero(db > pk - 45)[-1] + 1) * hop + int(0.05 * sr))

    # if the note's pitch only settles well after the onset, start there
    win, step = 4096, int(0.02 * sr)
    run = 0
    for i in range(start, end - win, step):
        if Spectrum(region[i:i + win], sr).note_score(midi) > 1:
            run += 1
            if run == 3:
                settled = i - 2 * step
                if (settled - start) / sr > 0.15:
                    start = settled - int(0.03 * sr)
                break
        else:
            run = 0

    clip = audio[a + start:a + end].copy()
    fi, fo = int(0.005 * sr), int(0.03 * sr)
    clip[:fi] *= np.linspace(0, 1, fi)[:, None]
    clip[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return clip, (a + start) / sr, (a + end) / sr


def update_manifest(out, name, notes):
    """Record this instrument's files in <out>/instruments.json."""
    path = os.path.join(out, "instruments.json")
    manifest = {"instruments": {}}
    if os.path.exists(path):
        with open(path) as f:
            manifest = json.load(f)
    manifest["instruments"][name] = {str(m): file_name(name, m) for m in notes}
    manifest["instruments"] = dict(sorted(manifest["instruments"].items()))
    with open(path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    return path


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("input", help="recording of an ascending chromatic scale")
    p.add_argument("--start", required=True, help="first note of the scale, e.g. A#3 or Bb3")
    p.add_argument("--name", help="file prefix (default: input file name, e.g. 'oboe')")
    p.add_argument("--out", help="output directory (default: same as input)")
    p.add_argument("--threshold", type=float, default=35, help="dB below the loudest point counted as silence (default 35)")
    p.add_argument("--dry-run", action="store_true", help="print labels without writing files")
    args = p.parse_args()

    audio, sr = sf.read(args.input, dtype="float64", always_2d=True)
    mono = audio.mean(axis=1)
    start = parse_note(args.start)
    name = args.name or os.path.splitext(os.path.basename(args.input))[0]
    out = args.out or os.path.dirname(os.path.abspath(args.input))
    span = 48  # look up to four octaves above --start

    segs = find_segments(mono, sr, args.threshold)
    spectra = []
    for a, b in segs:
        # analyse the steady middle of the note
        m0, m1 = a + (b - a) // 5, b - (b - a) // 5
        spectra.append(Spectrum(mono[m0:min(m1, m0 + int(1.5 * sr))], sr))
    scores = [[s.note_score(start + i) for i in range(span)] for s in spectra]
    labels = label_segments(scores, start, span)

    last_take = {m: k for k, m in enumerate(labels) if m is not None}
    print(f"{'time':>15}  {'note':5} {'tuning':>6}  status")
    for k, ((a, b), m) in enumerate(zip(segs, labels)):
        t = f"{a / sr:6.2f}-{b / sr:6.2f}s"
        if m is None:
            print(f"{t}  {'?':5} {'':>6}  skipped (noise or wrong note)")
        else:
            status = "kept" if last_take[m] == k else "earlier take, replaced"
            print(f"{t}  {note_name(m):5} {spectra[k].cents_off(m):+5.0f}c  {status}")

    played = sorted(last_take)
    missing = [note_name(m) for m in range(played[0], played[-1]) if m not in last_take] if played else []
    if missing:
        print(f"\nwarning: no take found for {', '.join(missing)}")
    if not played:
        sys.exit("no notes found - check --start")

    print(f"\n{len(played)} notes, {note_name(played[0])} to {note_name(played[-1])}")
    if args.dry_run:
        return
    for m in played:
        k = last_take[m]
        a, b = segs[k]
        limit = segs[k + 1][0] if k + 1 < len(segs) else len(mono)
        limit = min(limit, b + int(0.5 * sr))
        clip, t0, t1 = trim(audio, mono, sr, a, b, limit, m)
        path = os.path.join(out, file_name(name, m))
        sf.write(path, clip, sr, subtype="PCM_16")
    print(f"wrote {len(played)} files to {out}/{name}-*.wav")
    print(f"updated {update_manifest(out, name, played)}")


if __name__ == "__main__":
    main()
