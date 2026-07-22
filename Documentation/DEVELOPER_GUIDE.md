# Blackbox Lab — Developer Guide

Written for Daniel — a tour of what's inside after the v0.2
elevation, and how to keep building on it (with or without an AI
assistant at your side).

## The big picture

```
src/
  index.js            Electron main process (window creation)
  preload.js          Electron preload
  index.html          All screens (one <section data-screen> each)
  index.css           Styling
  renderer.js         Wires everything: file → decode → analyze → draw
  ui/
    navigation.js     Sidebar ⇄ screen switching
    charts.js         uPlot wrappers (time series + spectrum)
    screenUpdater.js  Your original results renderer (untouched)
  analysis/
    ...               Your original analysis modules (untouched)
    bbl/              NEW: native binary .bbl decoder
      byteStream.js     encodings (VB, zigzag, TAG groups)
      headerParser.js   header lines → field definitions
      frameDecoder.js   frames + predictors + corruption resync
      bblDecoder.js     whole files → decoded flights
      csvAdapter.js     decoded flight → CSV-shaped lines
    dsp/
      fft.js          FFT + Welch noise spectrum
tools/
  generateSampleLog.mjs   synthetic test flights (known truth)
samples/                  three ready-made .bbl flights
test/                     run with: npm test
```

## The key design decision

The decoder does NOT feed the analysis directly. It renders each
decoded flight into the same CSV-shaped lines your modules always
consumed (`csvAdapter.js`). That means:

- every analysis module you wrote works on raw .bbl files today,
- you can keep writing analysis against the familiar CSV shape,
- if the decoder ever misbehaves, CSV files still work as before.

## How the binary decoder works (short version)

A .bbl is ASCII header lines, then binary frames. Each header
"Field" line describes, per field: a PREDICTOR (what value we
expect) and an ENCODING (how the difference is stored). Decoding
reverses both: read the encoded delta, add the prediction.
Intraframes ("I") anchor the stream; interframes ("P") build on
the previous two frames; corrupt bytes are skipped by scanning to
the next plausible frame marker (see `frameDecoder.js`).

It was implemented clean-room from the published Blackbox format
specification — no GPL code was copied, so your MIT license
stays clean.

## Working on this with an AI assistant

- Point it at ONE module and its test file — small, precise asks
  beat "improve the app".
- `npm test` after every change; the decoder tests catch format
  regressions instantly.
- The generator is your friend: plant a known problem in a
  sample flight, then ask whether the analysis finds it.
- Keep your idiom: ES modules, descriptive names, one module per
  concern, section banners.

## Adding a new Lab (recipe)

1. Add a `<section data-screen="mylab">` in index.html and a
   sidebar button with `data-target="mylab"`.
2. Write `src/analysis/myLabAnalysis.js` consuming the CSV lines
   (see filterAnalysis.js for the pattern).
3. Call it from `logAnalysisBuilder.js`, render results in
   `screenUpdater.js`, add charts via `ui/charts.js`.
4. Add a test in `test/` using the sample generator.

## Releases

`npm run make` builds installers via Electron Forge. CI runs the
test suite on every push (`.github/workflows/ci.yml`).
