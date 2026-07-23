# Contributed flight data — what is shared, exactly

Blackbox Lab can (with the pilot's consent) share an anonymized copy
of the logs it analyzes. This data helps improve the analysis and
suggestions for everyone. This document is the complete, honest
description of what leaves the pilot's machine.

## The rules

1. **Off until asked.** The app asks once, on first launch. "No
   thanks" turns it off; nothing is ever sent. The choice can be
   changed anytime in Settings.
2. **Allowlist, not blocklist.** Only fields explicitly listed in
   `src/contribute/contributionBuilder.js` are included. Anything
   unknown is dropped by default — including future fields the
   firmware might add.
3. **Never included, in any configuration:**
   - pilot names or accounts (the app doesn't know them)
   - log dates and times
   - board information / serial numbers
   - absolute GPS coordinates — see below
4. **The pilot picks categories:**
   - *Core flight data* (always, when sharing is on): gyro,
     setpoint, PID terms, motor/servo outputs, headspeed.
   - *Battery & ESC* (optional): voltage, current, ESC telemetry.
   - *GPS* (optional, off by default): reduced to a RELATIVE track —
     every coordinate becomes an offset in meters from the first fix
     of that flight, plus speed and heading. The flight's shape and
     speeds survive; where it happened does not.
   - *Model & tuning* (optional): craft model name and tuning values
     (filters, governor, PIDs) so logs can be grouped by setup type.
5. **Private storage.** Contributed logs go to the project's private
   ingest endpoint and are used only to improve this tool. They are
   not published or passed on.

## Verifying this

The privacy rules are enforced by tests
(`test/contribution.test.mjs`) that build payloads from a synthetic
flight containing deliberately sensitive values (a real city-center
coordinate, a serial number, a log date, a pilot-named craft) and
assert they never appear in the output. If a change breaks a rule,
the test suite fails.
