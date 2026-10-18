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

## 6. Notes

- **In-browser Tailwind:** Tailwind builds its CSS in the browser on every page load. That's fine for this app, but Tailwind describes the browser build as meant for development. If it ever matters, a single Tailwind CLI command can produce a static CSS file instead.
- **Caching:** `python -m http.server` sends no cache headers, which already caused one confusing bug (a new `index.html` with an old `app.js`). After changes, do a hard refresh.
- **Testing:** jsdom with a fake audio engine still checks the logic (which notes are played and what the answer says). The browser server checks how things look. Neither checks how they sound.
