## v0.3.7 — release plumbing

### Added

- **Downloads for Intel Macs.** Releases now build a
  `Blackbox.Lab-darwin-x64-…zip` alongside the Apple Silicon package,
  so Macs from before 2020 are covered. Pick the one matching your
  machine — About This Mac says "Apple M…" or "Intel Core…".
- `Documentation/RELEASING.md` — the release steps in the browser,
  what each version file controls, and what to check if a build does
  not start.

### Changed

- The release build confirms the tag and the two version files agree
  before it builds anything, so any mismatch surfaces in about a
  minute with a message naming the file to update.

## v0.3.5 — the tuning charts release

### Added

- **Per-axis tuning preset charts** (from Ben Britton's feedback):
  the Log Viewer's single roll-only Setpoint-vs-Gyro chart is now
  three cards — Roll, Pitch and Yaw Tuning — each with three
  ready-made presets: Tracking (target + gyro), Feedforward check
  (+ I-term: I near zero while tracking = FF carrying the
  maneuver, as Rotorflight intends) and Term balance
  (target + P/I/D). Beginner mode shows Tracking only; Advanced
  mode lays everything out. Colors mean the same thing on every
  chart: blue target, orange gyro, green I, amber P, magenta D.
- **Remove individual flights from the Health Record**: every row
  in the Logged Flights table has a ✕ button — one bad log no
  longer means wiping the whole record. Trends recompute without
  the removed flight; Clear all history stays for the full wipe.
- The HTML report now includes the tracking chart for all three
  axes (was roll only).
- **Governor Lab: "The Worst Droop, In Context"** — the seconds
  around the biggest dip on one linked clock: target/actual RPM
  and error, motor output + collective, voltage + current, and
  the log's own recorded governor P/I/D/F/Sum terms (shown only
  when genuinely present, never estimated from throttle).
- **ESC Lab: "Highest-Load Moments"** — the hardest-working
  seconds with a plain-language cause each (at the limit /
  battery sag / normal load), a synchronized view of output,
  current + voltage, power and ESC temperature around the
  biggest event, and stable-flight averages per governor bank.
  ESC temperature telemetry is read for the first time.
- Charts in these views share their zoom — drag on one and the
  others follow. All scoring is untouched: evidence only.
- **PID Lab: "Tracking By Headspeed Profile"** — per-bank,
  per-axis tracking error plus an overshoot measure, because
  helicopters behave differently at different headspeeds.
- **Filter Lab: "Noise By Headspeed Profile"** — one spectrum
  per governor bank from that bank's own stable flight time,
  with peak classification and filter advice at that bank's
  actual rpm. Rotor harmonics move with headspeed; the combined
  spectrum can average away a peak that only one bank sees.
  Both per-profile cards appear when a flight visits two or
  more banks; scoring is untouched.
- **ESC load events understand collective**: the synchronized
  event view now includes the collective trace, and when an
  event's collective demand nears the flight's own maximum the
  reading becomes "Collective load" — the sag was a response to
  the load, not necessarily evidence of a weak pack.
- The sidebar now shows the app version.
- **The sample flight is now a real flight**: "Try a Sample
  Flight" loads a genuine recorded log with three headspeed
  banks and full ESC + governor telemetry, so the tour shows
  every card in the app — including the per-profile views.
  Bundled samples are never sent to the community bucket.

### Fixed

- The UI smoke test now asserts that all nine preset charts
  render with scaled data.

## v0.3.4 — feedforward doctrine + release repair

Builds directly on v0.3.3's scoring cleanup.

### Fixed

- Sustained feedforward output is no longer scored as PID-term
  saturation. In Rotorflight, feedforward is supposed to do the
  work during commanded motion, so sustained feedforward drive is
  now reported as expected behavior (informational, no score
  deduction). The v0.3.3 command-balance assessment remains the
  feedforward health signal and the verdict text now points at it.
- `src/version.js` now matches `package.json` again — v0.3.3
  installs showed a permanent "update available" banner. A new
  test keeps the two versions in lockstep from now on.
- v0.3.3's release tag was missing the `v` prefix, so the
  installer build never ran and its release page has no downloads.
  v0.3.4 (tagged `v0.3.4`) is the first downloadable build that
  carries all of the v0.3.3 fixes.

### Added

- Feedforward doctrine tests and the version lockstep test
  (suite: 49 tests).

## v0.3.3 — evidence and scoring cleanup

### Fixed

- Stable-flight detection now supports both full headspeed/governor-target logs and headspeed-only logs.
- Governor tracking and droop scoring are withheld when governor-target telemetry is unavailable.
- Overall Score now shows `N/A / Not Scored` when no performance systems are available for scoring.
- ESC and Governor sections now show explicit unavailable states instead of creating misleading scores.
- Missing evidence no longer produces false 100/100 Filter results.
- Filter Advisor peak detection now uses prominence above the local noise floor instead of raw FFT magnitude alone.
- Unavailable governor evidence no longer increases analysis confidence.
- Removed temporary application debug logging from analysis and rendering modules.
- Tightened recommendation wording so incomplete evidence does not produce unsupported tuning advice.

### Verified

- Bell BBL and matching CSV agree at 94/100 overall.
- Bell Governor result remains 83/100 — Watch.
- Stable-flight governor dip remains 22 RPM / 1.2%.
- Kraken headspeed-only logs still render Noise Spectrum and Filter Advisor while correctly withholding unsupported scoring.
- Test suite: 45 total, 44 passed, 0 failed, 1 skipped.
# Changelog

## v0.3.0 — "The Birthday Build, Part Two" (same evening)

The answers layer, completed:

- **Flight Verdict** — after every log the app lands on
  plain-language answer cards (vibration, rotor speed, tuning,
  battery) with status, cause, a "what to do" line and a
  show-me button that jumps to the evidence — zoomed to the
  exact frequency band or second where it happened.
- **Governor / ESC / Battery Labs** — real analyses with stories
  and metric tiles: droop % with a worst-droop marker on the
  chart, throttle headroom & saturation time, voltage sag,
  estimated internal resistance and consumed mAh.
- **Compare Flights** — before vs after with significance-aware
  deltas ("your change made the biggest vibration peak 86%
  better; nothing got worse") and an overlaid spectrum.
- **Health Record** — every analyzed flight filed per craft,
  locally; trend warnings when vibration, droop, internal
  resistance or tracking drift the wrong way across flights.
- **How to Use** — a five-step in-app guide with a no-jargon
  glossary; "Try a Sample Flight" needs one click and no file
  dialog; beginner mode by default, advanced on demand.
- Friendlier looks (same dark & blue soul), a sidebar credit,
  amplitude-calibrated FFT, spool-up excluded from spectra,
  unfiltered-gyro-first noise analysis, and a Playwright UI
  smoke test that loads the app and asserts the verdict renders.

## v0.2.0 — "The Birthday Build" (2026-07-22)

A gift from your friends at EGODRIFT. Happy birthday, Daniel. 🚁

### The headline

**Blackbox Lab now reads raw .bbl files natively.** No external
conversion, no CSV exports — open the file straight off the
flight controller, including files holding several flights.
Exactly as you put it: the raw data can build a better story of
the helicopter and see things the CSV log doesn't show.

### Added

- Native binary BBL decoder, implemented clean-room from the
  published Blackbox format specification (MIT-safe): all
  standard encodings and predictors, multi-flight files,
  corruption resync, end-of-log events. Validated against real
  Betaflight-family logs (24,893 frames, zero corruption) and
  spec reference vectors.
- Charts, everywhere it matters: gyro, setpoint-vs-gyro
  tracking, headspeed/governor, motor & power (uPlot, drag to
  zoom) — plus a noise spectrum in the Filter Lab powered by a
  built-in FFT. The teaching layer your vision asked for.
- Real navigation: every Lab is a screen now.
- Sample flight generator + three ready-made flights in
  `samples/` with known ground truth (vibration frequencies,
  governor behavior) — practice logs for users without a log at
  hand, and test fixtures for every future analysis.
- Test suite (18 tests) and GitHub Actions CI.
- Documentation: developer guide, finding-test-logs guide.

### Unchanged — deliberately

- Every analysis module you wrote. The decoder feeds them
  through a CSV adapter; your code is the heart of the app.
- Your product philosophy. It's the best part of the project.
