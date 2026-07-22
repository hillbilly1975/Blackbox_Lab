# Changelog

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
