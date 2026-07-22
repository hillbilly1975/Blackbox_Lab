// ======================================================
// BLACKBOX LAB — BBL DECODER TESTS
// ======================================================
//
// Run with:  npm test   (node --test)
//
// The encoding tests use the reference vectors published
// in the Blackbox format specification, plus a synthetic
// end-to-end log: we ENCODE frames ourselves per spec,
// decode them with the real decoder, and compare values.
//
// ======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { ByteStream } from "../src/analysis/bbl/byteStream.js";
import {
  parseHeader,
  findLogBoundaries,
  LOG_START_MARKER
} from "../src/analysis/bbl/headerParser.js";
import { decodeBblFile } from "../src/analysis/bbl/bblDecoder.js";
import { decodedFlightToCsvLines } from "../src/analysis/bbl/csvAdapter.js";

// ------------------------------------------------------
// Small spec-faithful encoder used to build test logs.
// ------------------------------------------------------

function encodeUnsignedVB(value, out) {
  let remaining = value >>> 0;

  while (remaining > 127) {
    out.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }

  out.push(remaining);
}

function encodeSignedVB(value, out) {
  const zigzag = ((value << 1) ^ (value >> 31)) >>> 0;
  encodeUnsignedVB(zigzag, out);
}

function asciiBytes(text) {
  return [...text].map((c) => c.charCodeAt(0));
}

// ------------------------------------------------------
// Encoding #1 — spec reference vectors
// ------------------------------------------------------

test("unsigned VB decodes the specification's example table", () => {
  const vectors = [
    [1, [0x01]],
    [42, [0x2a]],
    [127, [0x7f]],
    [128, [0x80, 0x01]],
    [129, [0x81, 0x01]],
    [23456, [0xa0, 0xb7, 0x01]]
  ];

  for (const [expected, bytes] of vectors) {
    const stream = new ByteStream(new Uint8Array(bytes));
    assert.equal(stream.readUnsignedVB(), expected);
  }
});

test("unsigned VB round-trips large values", () => {
  for (const value of [0, 300, 65535, 2 ** 21, 2 ** 28, 4294967295]) {
    const out = [];
    encodeUnsignedVB(value, out);
    const stream = new ByteStream(new Uint8Array(out));
    assert.equal(stream.readUnsignedVB(), value);
  }
});

// ------------------------------------------------------
// Encoding #0 — zigzag signed VB
// ------------------------------------------------------

test("signed VB zigzag matches the specification's fold table", () => {
  const folds = [
    [0, 0],
    [-1, 1],
    [1, 2],
    [-2, 3],
    [2147483647, 4294967294],
    [-2147483648, 4294967295]
  ];

  for (const [signedValue, zigzag] of folds) {
    const out = [];
    encodeUnsignedVB(zigzag, out);
    const stream = new ByteStream(new Uint8Array(out));
    assert.equal(stream.readSignedVB(), signedValue);
  }
});

test("signed VB round-trips across the range", () => {
  for (const value of [0, 1, -1, 63, -64, 8191, -8192, 1e6, -1e6]) {
    const out = [];
    encodeSignedVB(value, out);
    const stream = new ByteStream(new Uint8Array(out));
    assert.equal(stream.readSignedVB(), value);
  }
});

// ------------------------------------------------------
// Encoding #7 — TAG2_3S32, all four tiers
// ------------------------------------------------------

test("TAG2_3S32 tier 0 (2-bit fields)", () => {
  // 00 AA BB CC with A=1, B=-2, C=-1
  const byte = 0b00_01_10_11;
  const stream = new ByteStream(new Uint8Array([byte]));
  const values = new Int32Array(3);
  stream.readTag2_3S32(values);
  assert.deepEqual([...values], [1, -2, -1]);
});

test("TAG2_3S32 tier 1 (4-bit fields)", () => {
  // 0100 AAAA | BBBB CCCC with A=7, B=-8, C=-1
  const stream = new ByteStream(
    new Uint8Array([0b0100_0111, 0b1000_1111])
  );
  const values = new Int32Array(3);
  stream.readTag2_3S32(values);
  assert.deepEqual([...values], [7, -8, -1]);
});

test("TAG2_3S32 tier 2 (6-bit fields)", () => {
  // 10AAAAAA | 00BBBBBB | 00CCCCCC with A=31, B=-32, C=-1
  const stream = new ByteStream(
    new Uint8Array([0b10_011111, 0b00_100000, 0b00_111111])
  );
  const values = new Int32Array(3);
  stream.readTag2_3S32(values);
  assert.deepEqual([...values], [31, -32, -1]);
});

test("TAG2_3S32 tier 3 (per-field byte counts, little endian)", () => {
  // 11 ss ss ss — sizes: field0=1 byte, field1=2 bytes, field2=4 bytes
  const lead = 0b11_11_01_00;
  const bytes = [
    lead,
    0x85, // field0: -123 as int8
    0x2e, 0xfb, // field1: -1234 as int16 LE
    0x2e, 0xfd, 0x69, 0xb6 // field2: -1234567890 as int32 LE
  ];
  const stream = new ByteStream(new Uint8Array(bytes));
  const values = new Int32Array(3);
  stream.readTag2_3S32(values);
  assert.deepEqual([...values], [-123, -1234, -1234567890]);
});

// ------------------------------------------------------
// Encoding #8 — TAG8_4S16 (spec example)
// ------------------------------------------------------

test("TAG8_4S16 decodes the specification's worked example", () => {
  // Fields [13, 0, 4, 2] → sizes 8,0,4,4 bits
  // Header (2 bits per field, LSB pair = field 0): 01 01 00 10
  const stream = new ByteStream(
    new Uint8Array([0b01_01_00_10, 0x0d, 0x42])
  );
  const values = new Int32Array(4);
  stream.readTag8_4S16(values);
  assert.deepEqual([...values], [13, 0, 4, 2]);
});

test("TAG8_4S16 sign-extends nibble and 16-bit fields", () => {
  // Fields [-1 (4bit), -300 (16bit), 0, 5 (4bit)]
  // sizes: 1, 3, 0, 1 → header 01 00 11 01
  // nibble stream: F | FED4 (=-300) | 5  → bytes FF ED 45
  const stream = new ByteStream(
    new Uint8Array([0b01_00_11_01, 0xff, 0xed, 0x45])
  );
  const values = new Int32Array(4);
  stream.readTag8_4S16(values);
  assert.deepEqual([...values], [-1, -300, 0, 5]);
});

// ------------------------------------------------------
// Encoding #6 — TAG8_8SVB
// ------------------------------------------------------

test("TAG8_8SVB reads only the fields its header marks present", () => {
  // Fields [0, 0, 4, 0, 8] → header 0b00010100, then SVB(4), SVB(8)
  const out = [0b00010100];
  encodeSignedVB(4, out);
  encodeSignedVB(8, out);

  const stream = new ByteStream(new Uint8Array(out));
  const values = new Int32Array(5);
  stream.readTag8_8SVB(values, 5);
  assert.deepEqual([...values], [0, 0, 4, 0, 8]);
});

// ------------------------------------------------------
// Header parsing & multi-flight files
// ------------------------------------------------------

function buildTestLog({ frames }) {
  const header =
    LOG_START_MARKER +
    "\n" +
    "H Data version:2\n" +
    "H Firmware type:Rotorflight\n" +
    "H Firmware revision:4.4.0-test\n" +
    "H Craft name:Test Heli\n" +
    "H minthrottle:1070\n" +
    "H vbatref:2470\n" +
    "H I interval:32\n" +
    "H P interval:1/1\n" +
    "H Field I name:loopIteration,time,gyroADC[0],motor[0]\n" +
    "H Field I signed:0,0,1,0\n" +
    "H Field I predictor:0,0,0,4\n" +
    "H Field I encoding:1,1,0,1\n" +
    "H Field P predictor:6,2,1,1\n" +
    "H Field P encoding:9,0,0,0\n";

  const bytes = asciiBytes(header);

  let previous = null;
  let previous2 = null;

  for (const frame of frames) {
    const [iteration, time, gyro, motor] = frame;

    if (previous === null || iteration % 32 === 0) {
      // ---- intraframe ----
      bytes.push("I".charCodeAt(0));
      encodeUnsignedVB(iteration, bytes);
      encodeUnsignedVB(time, bytes);
      encodeSignedVB(gyro, bytes);
      encodeUnsignedVB(motor - 1070, bytes); // predictor 4
      previous2 = frame;
      previous = frame;
    } else {
      // ---- interframe ----
      bytes.push("P".charCodeAt(0));
      // loopIteration: predictor 6 + NULL encoding → nothing
      // time: predictor 2 (straight line), signed VB
      encodeSignedVB(time - (2 * previous[1] - previous2[1]), bytes);
      // gyro + motor: predictor 1 (previous), signed VB
      encodeSignedVB(gyro - previous[2], bytes);
      encodeSignedVB(motor - previous[3], bytes);
      previous2 = previous;
      previous = frame;
    }
  }

  // Tidy end-of-log event
  bytes.push("E".charCodeAt(0), 0xff);
  bytes.push(...asciiBytes("End of log"));
  bytes.push(0);

  return new Uint8Array(bytes);
}

const TEST_FRAMES = [
  [0, 1000, -5, 1100],
  [1, 1500, -3, 1102],
  [2, 2000, 4, 1105],
  [3, 2500, 12, 1103],
  [4, 3000, 6, 1101]
];

test("header parser extracts fields and sysConfig", () => {
  const log = buildTestLog({ frames: TEST_FRAMES });
  const boundaries = findLogBoundaries(log);
  assert.equal(boundaries.length, 1);

  const parsed = parseHeader(log, boundaries[0].start, boundaries[0].end);
  assert.equal(parsed.sysConfig.firmwareType, "Rotorflight");
  assert.equal(parsed.sysConfig.craftName, "Test Heli");
  assert.equal(parsed.sysConfig.minthrottle, 1070);
  assert.deepEqual(parsed.fields.main.names, [
    "loopIteration",
    "time",
    "gyroADC[0]",
    "motor[0]"
  ]);
  assert.deepEqual(parsed.fields.inter.predictors, [6, 2, 1, 1]);
});

test("decoder reconstructs I and P frames exactly", () => {
  const log = buildTestLog({ frames: TEST_FRAMES });
  const { flightCount, flights } = decodeBblFile(log);

  assert.equal(flightCount, 1);

  const flight = flights[0];
  assert.equal(flight.stats.intraFrames, 1);
  assert.equal(flight.stats.interFrames, TEST_FRAMES.length - 1);
  assert.equal(flight.stats.corruptFrames, 0);
  assert.equal(flight.stats.endOfLogSeen, true);

  const decoded = flight.mainFrames.map((frame) => [...frame]);
  assert.deepEqual(decoded, TEST_FRAMES);
});

test("multi-flight files split and decode independently", () => {
  const one = buildTestLog({ frames: TEST_FRAMES });
  const two = buildTestLog({ frames: TEST_FRAMES.slice(0, 3) });

  const combined = new Uint8Array(one.length + two.length);
  combined.set(one, 0);
  combined.set(two, one.length);

  const { flightCount, flights } = decodeBblFile(combined);
  assert.equal(flightCount, 2);
  assert.equal(flights[0].mainFrames.length, TEST_FRAMES.length);
  assert.equal(flights[1].mainFrames.length, 3);
});

test("corrupt bytes are skipped without losing the flight", () => {
  const log = buildTestLog({ frames: TEST_FRAMES });

  // Find the LAST interframe marker and stomp the bytes
  // after it with 0xFF runs — an impossible variable-byte
  // sequence that forces the decoder to reject and resync.
  const corrupted = Uint8Array.from(log);

  let lastP = -1;

  for (let i = corrupted.length - 1; i >= 0; i -= 1) {
    if (corrupted[i] === "P".charCodeAt(0)) {
      lastP = i;
      break;
    }
  }

  assert.ok(lastP > 0);

  for (let i = 1; i <= 6; i += 1) {
    corrupted[lastP + i] = 0xff;
  }

  const { flights } = decodeBblFile(corrupted);
  const flight = flights[0];

  // Decoding must survive, keep the healthy frames, and
  // report the damage instead of throwing.
  assert.ok(flight.mainFrames.length >= TEST_FRAMES.length - 2);
  assert.ok(flight.stats.corruptFrames >= 1);
});

test("csv adapter renders metadata, header row, and data rows", () => {
  const log = buildTestLog({ frames: TEST_FRAMES });
  const { flights } = decodeBblFile(log);
  const lines = decodedFlightToCsvLines(flights[0]);

  const craftLine = lines.find((line) => line.startsWith('"Craft name"'));
  assert.equal(craftLine, '"Craft name","Test Heli"');

  const headerRowIndex = lines.findIndex((line) =>
    line.startsWith("loopIteration,time,")
  );
  assert.ok(headerRowIndex > 0);

  const firstDataRow = lines[headerRowIndex + 1].split(",").map(Number);
  assert.deepEqual(firstDataRow, TEST_FRAMES[0]);

  assert.equal(
    lines.length - headerRowIndex - 1,
    TEST_FRAMES.length
  );
});
