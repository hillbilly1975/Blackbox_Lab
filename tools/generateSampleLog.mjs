// ======================================================
// BLACKBOX LAB — SAMPLE FLIGHT GENERATOR
// ======================================================
//
// Creates realistic Rotorflight-style helicopter flights
// as genuine BINARY .bbl files, with known ground truth:
// you decide the vibration frequencies, governor behavior
// and tune quality — then the Labs must find exactly that.
//
// Usage:
//   node tools/generateSampleLog.mjs                 # all presets → samples/
//   node tools/generateSampleLog.mjs clean-tuned 20  # one preset, 20 seconds
//
// Presets:
//   clean-tuned        well-tuned machine, light vibration
//   vibration-problem  strong 1/rev + tail resonance peaks
//   governor-sag       headspeed droops under collective load
//
// ======================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// ------------------------------------------------------
// Spec-faithful binary writers
// ------------------------------------------------------

function writeUnsignedVB(value, out) {
  let remaining = value >>> 0;

  while (remaining > 127) {
    out.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }

  out.push(remaining);
}

function writeSignedVB(value, out) {
  writeUnsignedVB(((value << 1) ^ (value >> 31)) >>> 0, out);
}

function writeTag2_3S32(values, out) {
  const fits = (v, bits) =>
    v >= -(1 << (bits - 1)) && v < 1 << (bits - 1);

  if (values.every((v) => fits(v, 2))) {
    out.push(
      ((values[0] & 0x03) << 4) |
        ((values[1] & 0x03) << 2) |
        (values[2] & 0x03)
    );
    return;
  }

  if (values.every((v) => fits(v, 4))) {
    out.push(0b0100_0000 | (values[0] & 0x0f));
    out.push(((values[1] & 0x0f) << 4) | (values[2] & 0x0f));
    return;
  }

  if (values.every((v) => fits(v, 6))) {
    out.push(0b1000_0000 | (values[0] & 0x3f));
    out.push(values[1] & 0x3f);
    out.push(values[2] & 0x3f);
    return;
  }

  const byteCount = (v) =>
    fits(v, 8) ? 1 : fits(v, 16) ? 2 : fits(v, 24) ? 3 : 4;

  const counts = values.map(byteCount);
  out.push(
    0b1100_0000 |
      ((counts[2] - 1) << 4) |
      ((counts[1] - 1) << 2) |
      (counts[0] - 1)
  );

  for (let i = 0; i < 3; i += 1) {
    let v = values[i];

    for (let b = 0; b < counts[i]; b += 1) {
      out.push(v & 0xff);
      v >>= 8;
    }
  }
}

function writeTag8_8SVB(values, out) {
  if (values.length === 1) {
    writeSignedVB(values[0], out);
    return;
  }

  let header = 0;

  values.forEach((v, i) => {
    if (v !== 0) {
      header |= 1 << i;
    }
  });

  out.push(header);

  for (const v of values) {
    if (v !== 0) {
      writeSignedVB(v, out);
    }
  }
}

function pushAscii(text, out) {
  for (const char of text) {
    out.push(char.charCodeAt(0));
  }
}

// ------------------------------------------------------
// Deterministic pseudo-random (same file every run)
// ------------------------------------------------------

function mulberry32(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------
// Flight physics model
// ------------------------------------------------------

const PRESETS = {
  "clean-tuned": {
    description: "Well-tuned 700-class heli: light vibration, crisp tracking",
    headspeedTarget: 1820,
    mainRotorVibration: 3, // deg/s amplitude at 1/rev
    tailVibration: 1.5,
    wideBandNoise: 1.2,
    governorStiffness: 0.15,
    loadSag: 4,
    trackingLag: 0.035, // seconds — crisp
    trackingDamping: 0.95 // near-critical: no overshoot
  },
  "vibration-problem": {
    description:
      "Mechanical trouble: strong 1/rev (imbalance) + tail resonance",
    headspeedTarget: 1780,
    mainRotorVibration: 28,
    tailVibration: 16,
    wideBandNoise: 4,
    governorStiffness: 0.15,
    loadSag: 6,
    trackingLag: 0.045,
    trackingDamping: 0.42 // underdamped: overshoot + ringing
  },
  "governor-sag": {
    description:
      "Weak governor: headspeed droops hard under collective load",
    headspeedTarget: 1850,
    mainRotorVibration: 5,
    tailVibration: 2.5,
    wideBandNoise: 1.6,
    governorStiffness: 0.035,
    loadSag: 65,
    trackingLag: 0.04,
    trackingDamping: 0.8
  }
};

const SAMPLE_RATE = 2000; // Hz logging rate
const I_INTERVAL = 32;
const TAIL_RATIO = 4.6; // tail rotor turns per main rotor turn

function buildHeader(preset, presetName) {
  const fields = {
    names: [
      "loopIteration",
      "time",
      "axisP[0]",
      "axisP[1]",
      "axisP[2]",
      "axisI[0]",
      "axisI[1]",
      "axisI[2]",
      "setpoint[0]",
      "setpoint[1]",
      "setpoint[2]",
      "setpoint[3]",
      "gyroADC[0]",
      "gyroADC[1]",
      "gyroADC[2]",
      "gyroUnfilt[0]",
      "gyroUnfilt[1]",
      "gyroUnfilt[2]",
      "motor[0]",
      "motor[1]",
      "headspeed",
      "governorTarget",
      "vbatLatest",
      "amperageLatest"
    ],
    // I-frame: absolutes. unsigned VB for counters/positives,
    // signed VB for anything that can be negative.
    iPredictors: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0],
    iEncodings: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    // P-frame: deltas. loopIteration increments silently,
    // time extrapolates, PID terms exercise the TAG group
    // encodings, everything else is previous + SVB delta.
    pPredictors: [6, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    pEncodings: [9, 0, 7, 7, 7, 6, 6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  };

  const lines = [
    "H Product:Blackbox flight data recorder by Nicholas Sherlock",
    "H Data version:2",
    "H Firmware type:Rotorflight",
    "H Firmware revision:4.4.0 (synthetic)",
    `H Firmware date:${new Date(2026, 0, 1).toDateString()}`,
    "H Board information:BLACKBOX_LAB_SIM",
    `H Craft name:Sample ${presetName}`,
    "H minthrottle:1070",
    "H maxthrottle:2000",
    "H vbatref:2520",
    `H I interval:${I_INTERVAL}`,
    "H P interval:1/1",
    `H Field I name:${fields.names.join(",")}`,
    `H Field I predictor:${fields.iPredictors.join(",")}`,
    `H Field I encoding:${fields.iEncodings.join(",")}`,
    `H Field P predictor:${fields.pPredictors.join(",")}`,
    `H Field P encoding:${fields.pEncodings.join(",")}`
  ];

  return { fields, headerText: lines.join("\n") + "\n" };
}

// Scripted stick inputs: hover, cyclic pulses, a yaw sweep,
// collective climbs — enough variety for every Lab.
function setpointAt(axis, t, duration) {
  const phase = t / duration;

  if (axis === 0) {
    // roll: two crisp cyclic pulses
    if (phase > 0.25 && phase < 0.27) return 180;
    if (phase > 0.55 && phase < 0.57) return -220;
    return 0;
  }

  if (axis === 1) {
    // pitch: one long elliptical pull
    if (phase > 0.4 && phase < 0.48)
      return 140 * Math.sin(((phase - 0.4) / 0.08) * Math.PI);
    return 0;
  }

  if (axis === 2) {
    // yaw: pirouette segment
    if (phase > 0.65 && phase < 0.78) return 90;
    return 0;
  }

  // collective (setpoint[3]): hover with two climbs
  if (phase > 0.3 && phase < 0.38) return 60;
  if (phase > 0.7 && phase < 0.76) return 80;
  return 12;
}

export function generateFlight(presetName, durationSeconds, seed = 20260722) {
  const preset = PRESETS[presetName];

  if (!preset) {
    throw new Error(
      `Unknown preset "${presetName}" — pick one of: ${Object.keys(PRESETS).join(", ")}`
    );
  }

  const random = mulberry32(seed);
  const { fields, headerText } = buildHeader(preset, presetName);

  const out = [];
  pushAscii(headerText, out);

  const frameCount = Math.floor(durationSeconds * SAMPLE_RATE);
  const dt = 1 / SAMPLE_RATE;

  const gyro = [0, 0, 0];
  const gyroRate = [0, 0, 0];
  const iTerm = [0, 0, 0];
  let headspeed = 0;
  let vbat = 2520; // volts × 100
  let previous = null;
  let previous2 = null;

  for (let n = 0; n < frameCount; n += 1) {
    const t = n * dt;

    // ---- rotor spool-up, then governed headspeed ----
    const spool = Math.min(1, t / 6);
    const collective = setpointAt(3, t, durationSeconds);
    const load = collective / 80;

    const governedTarget = preset.headspeedTarget * spool;
    const sag = preset.loadSag * load;
    headspeed +=
      (governedTarget - sag - headspeed) * preset.governorStiffness;

    const mainRotorHz = headspeed / 60;
    const tailHz = mainRotorHz * TAIL_RATIO;

    // ---- gyro follows setpoint as a second-order system:
    // damping < 1 produces the overshoot and ringing a
    // badly tuned helicopter really shows ----
    const naturalFrequency = 1 / preset.trackingLag;
    const damping = preset.trackingDamping;

    const cleanGyro = [0, 1, 2].map((axis) => {
      const target = setpointAt(axis, t, durationSeconds);
      const acceleration =
        naturalFrequency * naturalFrequency * (target - gyro[axis]) -
        2 * damping * naturalFrequency * gyroRate[axis];

      gyroRate[axis] += acceleration * dt;
      gyro[axis] += gyroRate[axis] * dt;
      return gyro[axis];
    });

    // ---- vibration + noise on the unfiltered gyro ----
    const vibration = (axisGain) =>
      preset.mainRotorVibration *
        axisGain *
        Math.sin(2 * Math.PI * mainRotorHz * t) +
      preset.mainRotorVibration *
        0.35 *
        axisGain *
        Math.sin(2 * Math.PI * 2 * mainRotorHz * t + 1.1) +
      preset.tailVibration *
        axisGain *
        Math.sin(2 * Math.PI * tailHz * t + 0.6) +
      preset.wideBandNoise * (random() * 2 - 1);

    const unfiltered = [
      cleanGyro[0] + vibration(1),
      cleanGyro[1] + vibration(0.8),
      cleanGyro[2] + vibration(1.2)
    ];

    // A simple software-filter stand-in: the "filtered"
    // trace keeps ~15% of the vibration.
    const filtered = [0, 1, 2].map(
      (axis) =>
        cleanGyro[axis] + (unfiltered[axis] - cleanGyro[axis]) * 0.15
    );

    // ---- PID terms, motors, battery ----
    const pTerm = [0, 1, 2].map((axis) =>
      Math.round(
        (setpointAt(axis, t, durationSeconds) - filtered[axis]) * 0.4
      )
    );

    [0, 1, 2].forEach((axis) => {
      iTerm[axis] = Math.max(
        -400,
        Math.min(
          400,
          iTerm[axis] +
            Math.round(
              (setpointAt(axis, t, durationSeconds) - filtered[axis]) *
                0.02
            )
        )
      );
    });

    const throttle = Math.round(
      1070 + 500 * spool + 260 * load + (random() * 8 - 4)
    );
    const tailMotor = Math.round(
      1070 + 420 * spool + 120 * Math.abs(cleanGyro[2] / 90)
    );

    const amps = Math.round((8 + 60 * load + 14 * spool) * 100);
    vbat = Math.max(
      2190,
      2520 - Math.round(14 * t * (0.4 + load)) / 10
    );

    const frame = [
      n, // loopIteration
      Math.round(t * 1_000_000), // time in microseconds
      pTerm[0],
      pTerm[1],
      pTerm[2],
      iTerm[0],
      iTerm[1],
      iTerm[2],
      Math.round(setpointAt(0, t, durationSeconds)),
      Math.round(setpointAt(1, t, durationSeconds)),
      Math.round(setpointAt(2, t, durationSeconds)),
      Math.round(collective),
      Math.round(filtered[0]),
      Math.round(filtered[1]),
      Math.round(filtered[2]),
      Math.round(unfiltered[0]),
      Math.round(unfiltered[1]),
      Math.round(unfiltered[2]),
      throttle,
      tailMotor,
      Math.round(headspeed),
      Math.round(governedTarget),
      Math.round(vbat),
      amps
    ];

    if (n % I_INTERVAL === 0 || previous === null) {
      // ---- intraframe ----
      out.push("I".charCodeAt(0));

      frame.forEach((value, i) => {
        const predicted =
          fields.iPredictors[i] === 4 ? value - 1070 : value;

        if (fields.iEncodings[i] === 1) {
          writeUnsignedVB(predicted, out);
        } else {
          writeSignedVB(predicted, out);
        }
      });

      previous2 = frame;
      previous = frame;
    } else {
      // ---- interframe ----
      out.push("P".charCodeAt(0));

      // time: straight-line predictor
      writeSignedVB(
        frame[1] - (2 * previous[1] - previous2[1]),
        out
      );

      // axisP group: TAG2_3S32
      writeTag2_3S32(
        [
          frame[2] - previous[2],
          frame[3] - previous[3],
          frame[4] - previous[4]
        ],
        out
      );

      // axisI group: TAG8_8SVB
      writeTag8_8SVB(
        [
          frame[5] - previous[5],
          frame[6] - previous[6],
          frame[7] - previous[7]
        ],
        out
      );

      // everything else: previous + signed VB delta
      for (let i = 8; i < frame.length; i += 1) {
        writeSignedVB(frame[i] - previous[i], out);
      }

      previous2 = previous;
      previous = frame;
    }
  }

  // Tidy end-of-log event
  out.push("E".charCodeAt(0), 0xff);
  pushAscii("End of log", out);
  out.push(0);

  return {
    bytes: new Uint8Array(out),
    preset,
    groundTruth: {
      preset: presetName,
      description: preset.description,
      sampleRateHz: SAMPLE_RATE,
      headspeedTarget: preset.headspeedTarget,
      expectedMainRotorPeakHz:
        Math.round((preset.headspeedTarget / 60) * 10) / 10,
      expectedTailPeakHz:
        Math.round((preset.headspeedTarget / 60) * TAIL_RATIO * 10) / 10
    }
  };
}

// ------------------------------------------------------
// CLI
// ------------------------------------------------------

const isDirectRun =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  const [presetArgument, secondsArgument] = process.argv.slice(2);
  const seconds = Number(secondsArgument) || 15;

  const presets = presetArgument
    ? [presetArgument]
    : Object.keys(PRESETS);

  const samplesDirectory = join(projectRoot, "samples");
  mkdirSync(samplesDirectory, { recursive: true });

  const manifest = [];

  for (const name of presets) {
    const { bytes, groundTruth } = generateFlight(name, seconds);
    const fileName = `sample-${name}.bbl`;

    writeFileSync(join(samplesDirectory, fileName), bytes);
    manifest.push({ file: fileName, ...groundTruth });

    console.log(
      `${fileName}  ${(bytes.length / 1024).toFixed(0)} KB  ` +
        `(main rotor peak ~${groundTruth.expectedMainRotorPeakHz} Hz, ` +
        `tail ~${groundTruth.expectedTailPeakHz} Hz)`
    );
  }

  writeFileSync(
    join(samplesDirectory, "ground-truth.json"),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`\nWrote ${presets.length} sample flight(s) to samples/`);
}
