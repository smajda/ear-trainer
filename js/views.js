// Draws the answer as a staff, a keyboard or a row of note names, from the
// data in display.js.

import { abc, keyboard, notesRow } from "./display.js";

const SVG = "http://www.w3.org/2000/svg";
const BLACK = new Set([1, 3, 6, 8, 10]);

export function renderStaff(el, d) {
  const box = document.createElement("div");
  box.className = `staff flex justify-center ${d.mode === "chord" ? "staff-chord" : ""}`;
  el.replaceChildren(box);
  // abcjs (vendor/abcjs-basic-min.js) is a classic script, so it's a global
  globalThis.ABCJS.renderAbc(box, abc(d), {
    add_classes: true, staffwidth: 200, scale: 1.4,
    paddingleft: 0, paddingright: 0, paddingtop: 0, paddingbottom: 0,
  });
}

export function renderKeyboard(el, d) {
  const { from, to, marks } = keyboard(d);
  const W = 16, H = 72, BW = 10, BH = 44;
  const whites = [];
  for (let m = from; m <= to; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${whites.length * W} ${H + 1}`);
  svg.setAttribute("class", "keyboard mx-auto w-full max-h-36");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Piano keyboard");
  const rect = (x, w, h, cls) => {
    const r = document.createElementNS(SVG, "rect");
    Object.entries({ x, y: 0.5, width: w, height: h, rx: 1.5, class: cls }).forEach(([k, v]) => r.setAttribute(k, v));
    svg.append(r);
  };
  whites.forEach((m, i) => {
    rect(i * W + 0.5, W - 1, H, `key white ${marks.get(m) ?? ""}`);
    if (m % 12 === 0) {
      const label = document.createElementNS(SVG, "text");
      Object.entries({ x: i * W + W / 2, y: H - 5, "text-anchor": "middle", class: "key-label" })
        .forEach(([k, v]) => label.setAttribute(k, v));
      label.textContent = `C${m / 12 - 1}`;
      svg.append(label);
    }
  });
  // black keys go on top, centred on the line after the white key below them
  for (let m = from; m <= to; m++) {
    if (!BLACK.has(m % 12)) continue;
    const i = whites.indexOf(m - 1) + 1;
    rect(i * W - BW / 2, BW, BH, `key black ${marks.get(m) ?? ""}`);
  }
  el.replaceChildren(svg);
}

export function renderNotes(el, d) {
  const row = document.createElement("div");
  row.className = "flex flex-wrap justify-center gap-1.5";
  for (const item of notesRow(d)) {
    const cell = document.createElement("span");
    const role = { top: "bg-primary text-primary-content", lower: "bg-base-300" }[item.role] ?? "";
    cell.className = `flex size-11 items-center justify-center rounded-full text-lg ${role}`;
    if (item.outside) cell.classList.add("underline", "decoration-2", "underline-offset-4");
    if (item.outside) cell.title = "Not in the scale";
    cell.textContent = item.name;
    row.append(cell);
  }
  el.replaceChildren(row);
}

export const VIEWS = { staff: renderStaff, keyboard: renderKeyboard, notes: renderNotes };
