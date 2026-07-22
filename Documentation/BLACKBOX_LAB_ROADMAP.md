# BLACKBOX LAB ROADMAP

## Mission

Build Blackbox Lab into the professional RotorFlight analysis suite that is simple for beginners while remaining powerful for advanced pilots.

Simple first.
Deeper when you want it.

---

# Core Principles

- Blackbox Lab NEVER changes RotorFlight settings.
- Blackbox Lab only recommends changes.
- Blackbox Lab explains WHY.
- Every recommendation must be supported by evidence.
- The pilot always makes the final decision.

---

# Evidence Engine

Recommendations should be based on every available source.

Priority:

1. Blackbox Log (BBL)
2. CLI Dump
3. CSV
4. Telemetry
5. Aircraft Profile
6. Firmware Version
7. ESC Telemetry
8. GPS
9. User supplied information

Every recommendation should explain what evidence was used.

Example:

Recommendation Confidence: HIGH

Evidence:
✓ Blackbox
✓ CLI
✓ CSV
✓ Telemetry

---

# Beginner Workflow

Blackbox Lab should guide new RotorFlight users through the same order used by RotorFlight.

1. Setup Verification
2. Filter Tuning
3. PID Tuning
4. Fine Adjustments
5. Governor Tuning
6. ESC Optimization
7. Battery Optimization
8. Final Flight Review

Never skip steps.

---

# Learning Philosophy

Teach.

Don't simply recommend.

Explain:

• Why
• What changed
• Expected result

---

# RotorFlight Integration

Future Goal:

Blackbox Lab recommends changes.

Open RotorFlight Configurator to the correct page.

User applies changes manually.

Blackbox Lab NEVER writes settings.

---

# Visual Learning

Future Features

• Filtered vs Unfiltered PID graphs
• Governor tracking graphs
• ESC efficiency graphs
• Battery efficiency graphs
• Vibration visualization
• Flight timeline
• GPS flight playback

---

# Reports

Professional Reports

Include

• Findings
• Evidence
• Confidence
• Recommendations
• Aircraft profile
• Firmware
• ESC
• Battery
• Attached logs

Export

PDF

Support Package

ZIP

---

# Community Sharing

Future Feature

Generate a shareable report that users can post directly to forums or social media.

The report should contain enough evidence that others can understand WHY the recommendation was made.

---

# Modes

Beginner Mode

Simple language
Guided workflow
Step-by-step

Advanced Mode

Raw data
Expert analysis
Graphs
Detailed statistics

---

# Design Philosophy

Clean

Professional

Simple

Fast

Minimal clicks

No clutter

---

# Goal

Make RotorFlight feel as approachable as iKon2 or Spirit while remaining technically accurate enough for professional pilots.
---

# Gift Ideas (from your friends at EGODRIFT, 2026-07-22)

Suggestions only — this is your project and your vision. Five
things we believe would make Blackbox Lab one of a kind:

1. **Practice Mode.** Ship known-problem sample flights and walk
   new pilots through diagnosing them INSIDE the app, before
   they ever risk their own machine. (Log files only — nothing
   ever touches a helicopter.) The generator in tools/ makes
   unlimited practice material with known truth.

2. **Before/After Compare.** Two logs side by side, same charts,
   and one sentence: "your change reduced the 136 Hz tail peak
   by 62%." The emotional payoff of the whole tuning loop.

3. **The Helicopter's Health Record.** File every analyzed log
   per craft (craft name is in the header) and trend vibration
   across sessions: "tail vibration doubled over five flights —
   check the bearings." Predictive maintenance, from data you
   already extract.

4. **Evidence You Can Click.** Every recommendation deep-links
   to the zoomed chart region that proves it. Evidence stops
   being a checklist and becomes something a pilot sees.

5. **One-File Shareable Reports.** Export a single HTML file —
   charts embedded, findings, confidence — that works on any
   forum or support email. No server, no account.
