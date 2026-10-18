# Reworking the UI

A record of the session that gave the app a design foundation and a simpler layout, after chord mode was built (see [chord-mode.md](chord-mode.md)). User messages and the planning questions are quoted exactly; the narrative in between is a summary.

## 1. Choosing a design foundation

> first, this is a bit ugly. can we use shadcdn or daisyui or something to give us a design foundation to work with?

shadcn/ui is React components styled with Tailwind. Using it would mean adding React and a build step, and rewriting the interface. The app is plain HTML/JS with no build step, so the other options fit better. (✅ = chosen answer.)

**Which design foundation should the app use? (The app is plain HTML/JS with no build step.)**

- ✅ **daisyUI + Tailwind (Recommended)**: daisyUI 5 components (btn, join, select, toggle, card, themes) and Tailwind utility classes. Both load in the browser, so there's no build step. It looks the most like a modern app and has many themes, including light/dark. Downside: Tailwind's in-browser compiler is intended for development, so for production we'd later add a one-command CSS build or keep the small delay.
  ```
  <div class="card bg-base-100 shadow">
    <div class="join">
      <input class="join-item btn"
        type="radio" name="mode"
        aria-label="Intervals">
      <input class="join-item btn"
        type="radio" name="mode"
        aria-label="Over a chord">
    </div>
    <select class="select">...</select>
    <button class="btn btn-primary">
      Start</button>
  </div>

  <html data-theme="cupcake">
  ```
- **Pico CSS**: Styles plain HTML elements (buttons, selects, fieldsets, sliders) well without any classes. One small CSS file that can be stored in the repo, so it works offline. Clean and minimal, but there are fewer components and less personality.
  ```
  <link rel="stylesheet"
    href="vendor/pico.min.css">

  <!-- markup barely changes -->
  <fieldset>
    <legend>Mode</legend>
    <label><input type="radio"> ...
  </fieldset>
  <button>Start</button>
  ```
- **Web Awesome / Shoelace**: Polished web components (<wa-select>, <wa-radio-group>, <wa-button>), loaded from a CDN with no build. Good-looking out of the box, but the settings code needs reworking to use the components' events and values.
- **shadcn (React + build)**: Rewrite the UI in React with Vite, Tailwind and shadcn/ui. This is the most work, and it adds a build step to deploys.

**Should the CSS framework be loaded from a CDN or stored in the repo?**

- ✅ **Store in repo (Recommended)**: Download the files into vendor/ and add them to deploy.sh. Works offline and doesn't depend on a CDN, like the samples.
- **CDN**: Pinned <link>/<script> tags from jsDelivr. Nothing to store, but needs network.

## 2. Applying daisyUI

- **Versions:** the newest daisyUI (5.7.50) was only five days old, so the files are pinned to the newest releases at least two weeks old: daisyUI 5.7.47 (`vendor/daisyui.css`, 1.1 MB) and the Tailwind 4.3.3 browser build (`vendor/tailwindcss-browser.js`, 280 KB). `deploy.sh` now uploads `vendor/`.
- **Themes:** daisyUI's plain CSS has light and dark themes, but it doesn't switch between them by itself. A few lines in the page head set `data-theme` from the system setting and follow it if it changes. The file with daisyUI's ~35 other themes was downloaded, then dropped because nothing used it.
- **Controls:**
  - Mode, Chords, Direction and Next question became daisyUI button groups (`join` with radio inputs styled as buttons).
  - The interval grid became checkbox buttons, which daisyUI colours with the primary colour when they're ticked. Intervals that can't come up are dimmed.
  - Dropdowns, sliders and the key hints use daisyUI's `select`, `range` and `kbd` styles.
- **CSS:** `style.css` shrank to the few rules the classes don't cover (slider rows, dimmed intervals, hiding key hints on touch screens).
- **IDs unchanged:** the element IDs and input names stayed the same, so `app.js` only changed where it builds the interval grid.

## 3. Getting a real browser

When chord mode was built, headless Chromium wouldn't start inside the session's [nono](https://nono.sh) sandbox, so checks ran under jsdom instead. That's fine for logic, but it can't show what the page looks like.

> you said you had a sandbox issue reaching chromium headless. i can fix that if you tell me what to do to my nono config.

> so back to the chromium headless issue, if i resolve that would it help you as we get more into UI stuff?

Yes: with screenshots, layout, spacing, dark mode and phone width can be checked directly instead of guessed. Two ways were suggested:

- **Run the browser outside the sandbox:** Playwright's `run-server` in a normal terminal, with the session connecting over localhost. This leaves the sandbox unchanged.
- **Change the profile:** nono's only related setting is `ipc_mode`. It's documented for POSIX semaphores, while Chromium failed on registering a macOS Mach service, so it might not help.

> where do i put that ipc_mode change in my nono config?

The setting goes in a top-level `security` section of the active profile (`claude-personal.json`). Writing a draft profile from inside the session was blocked by Claude Code's auto-mode classifier as a security weakening, which is reasonable: it was the sandboxed agent loosening its own sandbox. So the edit was described for the user to make.

> ok, i restarted try it now

Chromium failed exactly as before (`bootstrap_check_in … Permission denied`), so `ipc_mode: "full"` doesn't cover it and is better reverted.

> ok its running

With `npx -y playwright@1.64.1 run-server --port 3123` running outside the sandbox, the session connects with `chromium.connect("ws://localhost:3123/")`, loads the app from the user's `npm start` server, and saves screenshots to its scratchpad to look at.

## 4. First look

Screenshots at desktop size, in dark mode and at phone width showed everything rendering. In the first set, the Start button and the selected Mode looked washed out, but that was daisyUI's button transition caught mid-fade; waiting 600ms before each screenshot fixed it. Things noticed:

- The quiz card was mostly empty space before the first question.
- On a phone, the settings made a very long scroll under the quiz.
- The Mode toggle was bigger than the other toggles, and the dropdown widths didn't match.
- The theme is daisyUI's stock purple.

## 5. Settings in a drawer

> ok, first: lets put all the settings into a drawer sidebar that can be shown/hidden. its a bit of an everything bucket and is distracting. the main column should display a summary of the selected options, that's it: something like "Chord mode, key of C major" so "Chord mode, fixed C major" or "Interval mode"

- **Layout:** the page is one centred column: a header with the app name, then the quiz card. All the settings moved into a daisyUI `drawer` that slides in from the right, 320px wide on a phone and 384px from small tablets up.
- **Summary:** the header shows the current setup in the requested wording: "Interval mode", "Chord mode, key of C major" or "Chord mode, fixed D♭ major". It's refreshed every time settings are saved. The summary and a sliders icon next to it open the drawer.
- **Closing:** the drawer closes with its ✕, by clicking the dimmed page, or with Escape. Escape works even while a dropdown in the drawer has focus.
- **Spacing:** the screenshots showed the answer sitting right on top of the Replay/Next buttons, so the card got more space between them.
- **Edge sliver:** the desktop screenshots also showed a 1px sliver at the right edge of the open drawer. Nothing in the page is there, so it's most likely a headless rendering quirk; it's still to be checked in a real browser.

> lets commit that and lets do this: make sure the chord mode doc is up-to-date - i will want to come back to that - but make a new one for these ui changes and document what we've done so far. you can commit both of those. keeping both things on the same branch for now is fine.

The daisyUI and drawer changes were committed together on `chord-mode`. Then the chord-mode doc got a "Trying it" section and a list of open items, and this document was written.

## 6. Answer views

> ok lets work on how we display the responses. Can we do something like this,  a perfect fourth over c minor as our example here:
>
> ```
> #     Perfect 4th
> ##   F over C minor
>
>    [ staff | keyboard | notes ]
>
> ```
>
> Then depending on whether staff, keyboard, or notes are selected we display:
>
> - A musical staff showing the chord and then the note played. render it as one bar with the chord being played on the 1 and the interval on the 3
> - A piano keyboard showing the chord and the interval. Use gray for the chord notes and the highlight color for the interval
> - Just a series of notes in the key with circles over the chord note and interval note. if the interval is outside of the key, inject it into the list but underline it

Three things were decided without asking: the staff would be drawn by [abcjs](https://abcjs.net), stored in `vendor/` (it handles clefs, ledger lines, accidentals and key signatures from a short piece of text notation); the keyboard would be SVG covering whole octaves around the notes; and the chosen view would be remembered like the other settings. The rest went to questions.

**In the 'notes' view, which notes get circled, and where does the row start? (Example: F over C minor, key of E♭ major)**

- ✅ **All chord tones + top note, from root**: The row starts on the chord's root, so counting up to the top note gives the interval. Chord tones are circled in gray and the top note in the highlight colour, matching the keyboard.
  ```
   (C)  D  (E♭)  F̲  (G)  A♭  B♭
    ○       ○    ◉    ○

    gray circles: chord  C E♭ G
    colour circle: top note F
  ```
- **All chord tones + top note, from tonic**: The row is the key's scale from its tonic, so you see where the chord sits in the key.
  ```
   E♭  F  (G)  A♭  B♭  (C)  D
        ◉   ○            ○
   (wraps: C E♭ G + F)
  ```
- **Root + top note only, from root**: Just two circles: the root and the top note. The simplest way to see the interval.
  ```
   (C)  D  E♭  (F)  G  A♭  B♭
    ○           ◉
  ```

(The first preview wrongly showed F underlined. F is in the key, so it isn't underlined in the app.)

**Fixed-chord mode has no key. Which notes should the 'notes' row show there?**

- ✅ **A scale that fits the chord (Recommended)**: The scale a player would usually use over the chord, so a top note outside it is underlined.
  ```
  major, maj7   → major
  minor, m7     → natural minor
  7 (dominant)  → Mixolydian
  dim, m7♭5     → Locrian
  augmented     → whole tone

  C minor + F → C D E♭ F G A♭ B♭
  ```
- **Major or minor of the root**: Simpler: the major scale for major-type chords and natural minor for minor, diminished and half-diminished.
- **Chromatic**: All 12 notes from the root, with nothing underlined.

**How should the staff look?**

- ✅ **Grand staff, key signature (Recommended)**: Treble and bass staves in one bar. Piano chord in the bass clef as a whole note, top note in the treble clef on beat 3 after a half rest. Key mode shows the key signature; fixed mode uses accidentals only.
  ```
    𝄞  ♭♭♭  𝄼  —   ♩(F5)  |
    𝄢  ♭♭♭  𝅝(C E♭ G)       |
         1        3
  ```
- **Grand staff, no key signature**: The same layout, but every note gets its own accidental, even in key mode.
- **Single staff**: Everything on one treble staff with ledger lines (the chord is low, so lots of ledger lines).

**Should interval mode get the same three views?**

- ✅ **Yes, all three**: Staff: first note, second note, then both together in one bar. Keyboard: both notes, the low one gray. Notes: the major scale of the low note, with the high note underlined if it's outside it.
  ```
  #     Major 3rd
  ##   B♭3 → D4
     [ staff | keyboard | notes ]
  ```
- **Staff and keyboard only**: Interval mode has no key, so leave out the notes view there.
- **No, chord mode only**: Interval mode keeps its current text answer.

What was built:

- **Answer:** a large title ("Perfect 4th"; "Root (octave)" for P8 in chord mode; "Major 3rd, descending" in interval mode) and a subtitle ("F over C minor", or "B♭4 → D5"). Under them are daisyUI tabs for Staff, Keyboard and Notes. This replaces the old answer, which had the short name, the full name and a line of spelled notes.
- **`js/display.js`:** builds everything the views need from a question, in either mode: the titles, the notes row, the ABC notation for the staff, and the keyboard's range and marked keys. It has no browser code and is covered by `tests/display.test.js`. Chord questions now record their key, so the answer doesn't depend on settings changed after the question was asked.
- **`js/views.js`:** draws the three views.
  - **Staff:** abcjs 6.7.1 (`vendor/abcjs-basic-min.js`, 500 KB), with the top note coloured in chord mode. Key mode uses the key signature, and every other note gets an explicit accidental.
  - **Keyboard:** SVG from the C below the lowest note to the B above the highest, with C keys labelled. Chord notes (or the interval's low note) are gray and the top note uses the highlight colour.
  - **Notes:** circles from the root. Chord tones are gray and the top note uses the highlight colour. A top note outside the scale is slotted in where it falls and underlined.
- **Behaviour:** the chosen view is saved, and switching views redraws the current answer. Clicking a tab gives keyboard focus back so Space still moves to the next question.

Checking it with screenshots turned up three problems, all fixed:

- **Tiny staff:** abcjs's `responsive: "resize"` option drew the staff very small and pushed it to the left. A fixed staff width and scale fixed it.
- **Inverted keyboard:** the key colours came from the theme's text and background colours, so in dark mode the "black" keys were light. A keyboard should look like a keyboard in either theme, so its colours are now fixed. Only the highlight colour follows the theme.
- **Test mistakes:** two expectations in the new tests were wrong (MIDI 70 is B♭4, so a major 3rd up is D5, not D4).

The final screenshots covered F over C minor, F♯ over C minor (slotted in and underlined), the E♭ key signature in dark mode, interval mode, and phone width. At phone width a four-octave keyboard gets small but stays readable.

## 7. Notes

- **In-browser Tailwind:** Tailwind builds its CSS in the browser on every page load. That's fine for this app, but Tailwind describes the browser build as meant for development. If it ever matters, a single Tailwind CLI command can produce a static CSS file instead.
- **Caching:** `python -m http.server` sends no cache headers, which already caused one confusing bug (a new `index.html` with an old `app.js`). After changes, do a hard refresh.
- **Testing:** jsdom with a fake audio engine still checks the logic (which notes are played and what the answer says). The browser server checks how things look. Neither checks how they sound.
