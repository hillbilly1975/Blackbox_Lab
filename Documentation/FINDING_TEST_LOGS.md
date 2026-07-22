# Finding Real Logs to Test With

Blackbox Lab needs flight logs to grow on. Here is where they
live, from easiest to best.

## 1. The built-in samples (in this repo)

`samples/` contains three synthetic Rotorflight-style helicopter
flights as genuine binary .bbl files, with `ground-truth.json`
describing exactly what is in them (vibration frequencies,
governor behavior, tune quality):

- `sample-clean-tuned.bbl` — a healthy, well-tuned machine
- `sample-vibration-problem.bbl` — strong 1/rev + tail resonance
- `sample-governor-sag.bbl` — headspeed droops under load

Because the truth is known, they are perfect for testing whether
an analysis finds what it should. Regenerate or customize with:

    node tools/generateSampleLog.mjs

NOTE: these are LOG FILES for the app — recordings of flights.
They are not firmware and cannot be "flashed" to anything.

## 2. Real logs on GitHub (verified to decode)

The MIT-licensed test fixtures of the `Iteratrix/propwash` repo
carry real Betaflight-family flights (same binary format family
as Rotorflight). Verified against our decoder — 24,893 frames,
zero corruption:

    https://github.com/Iteratrix/propwash/tree/HEAD/propwash-core/tests/fixtures

Also: `ilya-epifanov/fc-blackbox` and `gimbal-ghost/gimbal-ghost`
(the upstream sources of those fixtures).

These are multirotor logs, not helicopters — great for decoder
and chart testing, wrong field mix for heli-specific analysis.

## 3. Real ROTORFLIGHT helicopter logs (the good stuff)

- **Rotorflight Discord** — the #blackbox / support channels see
  logs posted daily; ask and most pilots gladly share.
- **HeliFreak forum, Rotorflight section** — tuning threads with
  attached logs.
- **rotorflight-firmware GitHub issues** — bug reports often
  attach .bbl files.
- **Your own users** — every support request that includes a log
  is (with permission) a test fixture. Building a small library
  of donated logs, tagged by helicopter class and problem, is
  the single most valuable asset this project can accumulate.

## 4. Local integration testing

Drop any real log into `test/fixtures/` (gitignored) and the
optional integration test will pick it up:

    mkdir -p test/fixtures
    curl -sL <log url> -o test/fixtures/real.bbl
    npm test
