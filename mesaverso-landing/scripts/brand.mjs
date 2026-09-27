// MESAVERSO logo geometry (brand manual 5B · Titanio + Luz Cálida). Shared by make-brand.mjs
// (SVG files) and build.mjs (the logo markup in the page). No side effects.
//
// Isotype: an "M" drawn with a single line. It starts at the venue (titanium dot) and ends at
// the customer (warm-light dot); nobody in between. The warm dot is "the order arriving".

export const C = { noche: "#0E1014", grafito: "#2A2D33", titanio: "#C3C8CE", niebla: "#F1F2EE", luz: "#FFD6A5" };

// 100-unit grid. The line ends at y=80; the dots (r=10) are centred at y=82.
export const LINE = "M16 80V22L50 60L84 22V80";
export const TRACK = "M16 82V22L50 60L84 22V82"; // the path the warm dot travels
export const CROP = { x: 6, y: 16.5, w: 88, h: 75.5 }; // glyph box: stroke top → dot bottom
export const STROKE = 11;
export const STROKE_SMALL = 12; // below ~20px

// Main logo [M]ESAVERSO: the M is as tall as the capitals of Familjen Grotesk (780/1200 = .65em)
// and its dots sit on the baseline. In em of the word's font-size:
export const CAP = 0.65;
export const M_W = (CAP * CROP.w) / CROP.h; // .758em
export const M_GAP = 0.05;
export const LETTER = 0.04;

// 8 s loop: the warm dot fades out, reappears at the start and travels the M (~1.8 s, ease-in-out).
export const ANIM = `<animateMotion dur="8s" repeatCount="indefinite" calcMode="spline" path="${TRACK}" keyPoints="1;1;0;0;1;1" keyTimes="0;0.62;0.64;0.7;0.925;1" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0.65 0 0.35 1;0 0 1 1"/><animate attributeName="opacity" dur="8s" repeatCount="indefinite" values="1;1;0;0;1;1" keyTimes="0;0.6;0.63;0.66;0.7;1"/>`;

export const glyph = ({ line, start, end }, { stroke = STROKE, endDot = true } = {}) =>
  `<path d="${LINE}" fill="none" stroke="${line}" stroke-width="${stroke}" stroke-linejoin="round"/>` +
  `<circle cx="16" cy="82" r="10" fill="${start}"/>` +
  (endDot ? `<circle class="mv-dot" cx="84" cy="82" r="10" fill="${end}"/>` : "");

// The page's logo (the "MesaversoLogo" component): live text + inline SVG M, sized by font-size.
// Colours come from CSS (--logo-line / --logo-end / currentColor) so it adapts to light sections.
// data-animated → app.js turns the static warm dot into the 8 s loop (skipped on reduced motion).
// The animation ships inside the markup with begin="indefinite", so the logo is static until
// app.js starts it (and never starts with reduced motion or without JavaScript).
export const logoHtml = ({ animated = false, tag = "span" } = {}) => {
  const colours = { line: "var(--logo-line)", start: "var(--logo-line)", end: "var(--logo-end)" };
  const end = animated
    ? `<circle class="mv-dot" cx="84" cy="82" r="10" fill="${colours.end}">${ANIM.replaceAll(' dur="8s"', ' begin="indefinite" dur="8s"')}</circle>`
    : "";
  return `<${tag} class="mv-wordmark"${animated ? " data-animated" : ""} role="img" aria-label="MESAVERSO">` +
    `<svg viewBox="${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}" aria-hidden="true" focusable="false">` +
    glyph(colours, { endDot: !animated }) + end +
    `</svg><span aria-hidden="true">ESAVERSO</span></${tag}>`;
};
