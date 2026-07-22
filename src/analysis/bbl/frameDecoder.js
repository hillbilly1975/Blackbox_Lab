// ======================================================
// BLACKBOX LAB — BBL FRAME DECODER
// ======================================================
//
// Walks the binary frame stream of one log and rebuilds
// every value by reversing the encoding (byteStream.js)
// and then the predictor, exactly as the specification
// defines them:
//
//   0 ZERO         value
//   1 PREVIOUS     value + previous frame
//   2 STRAIGHT     value + 2*prev - prev2
//   3 AVERAGE_2    value + trunc((prev + prev2) / 2)
//   4 MINTHROTTLE  value + minthrottle header
//   5 MOTOR_0      value + motor[0] decoded this frame
//   6 INCREMENT    value + prev + skipped iterations
//   7 HOME_COORD   value + home coordinate (H frame)
//   8 1500         value + 1500
//   9 VBATREF      value + vbatref header
//  10 LAST_TIME    value + time of last main frame
//
// Corrupt data never throws away a whole flight: a frame
// that fails validation is dropped, the stream resyncs at
// the next plausible frame marker, and decoding continues.
//
// ======================================================

import { ByteStream, ENCODING } from "./byteStream.js";

const PREDICTOR = {
  ZERO: 0,
  PREVIOUS: 1,
  STRAIGHT_LINE: 2,
  AVERAGE_2: 3,
  MINTHROTTLE: 4,
  MOTOR_0: 5,
  INCREMENT: 6,
  HOME_COORD: 7,
  VALUE_1500: 8,
  VBATREF: 9,
  LAST_MAIN_FRAME_TIME: 10
};

const FRAME_MARKERS = new Set(
  ["I", "P", "G", "H", "S", "E"].map((c) => c.charCodeAt(0))
);

const END_OF_LOG_EVENT = 0xff;

// Should this loop iteration have been logged? Mirrors the
// specification's frame-selection formula so the INCREMENT
// predictor can count skipped iterations.
function iterationIsLogged(iteration, iInterval, pInterval) {
  if (iteration % iInterval === 0) {
    return true;
  }

  const { num, denom } = pInterval;
  return ((iteration % iInterval) + num - 1) % denom < num;
}

export class FrameDecoder {
  constructor(bytes, start, end, parsedHeader) {
    this.stream = new ByteStream(bytes, start, end);
    this.fields = parsedHeader.fields;
    this.sysConfig = parsedHeader.sysConfig;

    const mainCount = this.fields.main ? this.fields.main.count : 0;

    this.previous = new Int32Array(mainCount);
    this.previous2 = new Int32Array(mainCount);
    this.hasPrevious = false;

    this.homeCoordinates = new Int32Array(
      this.fields.gpsHome ? this.fields.gpsHome.count : 0
    );
    this.hasHomeCoordinates = false;

    this.lastMainFrameTime = 0;
    this.motorZeroIndex = this.fields.main
      ? this.fields.main.names.indexOf("motor[0]")
      : -1;
    this.timeIndex = this.fields.main
      ? this.fields.main.names.indexOf("time")
      : -1;
    this.iterationIndex = this.fields.main
      ? this.fields.main.names.indexOf("loopIteration")
      : -1;

    this.mainFrames = [];
    this.slowFrames = [];
    this.gpsFrames = [];
    this.events = [];

    this.stats = {
      intraFrames: 0,
      interFrames: 0,
      slowFrames: 0,
      gpsFrames: 0,
      eventFrames: 0,
      corruptFrames: 0,
      endOfLogSeen: false
    };
  }

  // ----------------------------------------------------
  // Raw field pass: reverse the ENCODING only. Group
  // encodings (TAG8_8SVB / TAG2_3S32 / TAG8_4S16) consume
  // several consecutive fields with one shared header, so
  // the loop batches runs of the same encoding.
  // ----------------------------------------------------
  readRawValues(definitions, output) {
    const { count, encodings } = definitions;
    const group = new Int32Array(8);

    let index = 0;

    while (index < count) {
      const encoding = encodings[index];

      if (encoding === ENCODING.NULL) {
        output[index] = 0;
        index += 1;
        continue;
      }

      if (encoding === ENCODING.SIGNED_VB) {
        output[index] = this.stream.readSignedVB();
        index += 1;
        continue;
      }

      if (encoding === ENCODING.UNSIGNED_VB) {
        output[index] = this.stream.readUnsignedVB();
        index += 1;
        continue;
      }

      if (encoding === ENCODING.NEG_14BIT) {
        output[index] = this.stream.readNeg14Bit();
        index += 1;
        continue;
      }

      if (encoding === ENCODING.TAG8_8SVB) {
        let runLength = 1;

        while (
          runLength < 8 &&
          index + runLength < count &&
          encodings[index + runLength] === ENCODING.TAG8_8SVB
        ) {
          runLength += 1;
        }

        this.stream.readTag8_8SVB(group, runLength);

        for (let i = 0; i < runLength; i += 1) {
          output[index + i] = group[i];
        }

        index += runLength;
        continue;
      }

      if (encoding === ENCODING.TAG2_3S32) {
        this.stream.readTag2_3S32(group);

        for (let i = 0; i < 3 && index + i < count; i += 1) {
          output[index + i] = group[i];
        }

        index += 3;
        continue;
      }

      if (encoding === ENCODING.TAG8_4S16) {
        this.stream.readTag8_4S16(group);

        for (let i = 0; i < 4 && index + i < count; i += 1) {
          output[index + i] = group[i];
        }

        index += 4;
        continue;
      }

      throw new RangeError(`Unsupported encoding ${encoding}`);
    }
  }

  // ----------------------------------------------------
  // Predictor pass: turn decoded deltas into real values.
  // ----------------------------------------------------
  applyPredictor(predictor, raw, fieldIndex, current) {
    switch (predictor) {
      case PREDICTOR.ZERO:
        return raw;

      case PREDICTOR.PREVIOUS:
        return raw + this.previous[fieldIndex];

      case PREDICTOR.STRAIGHT_LINE:
        return (
          raw + 2 * this.previous[fieldIndex] - this.previous2[fieldIndex]
        );

      case PREDICTOR.AVERAGE_2:
        return (
          raw +
          Math.trunc(
            (this.previous[fieldIndex] + this.previous2[fieldIndex]) / 2
          )
        );

      case PREDICTOR.MINTHROTTLE:
        return raw + this.sysConfig.minthrottle;

      case PREDICTOR.MOTOR_0:
        return raw + (this.motorZeroIndex >= 0
          ? current[this.motorZeroIndex]
          : 0);

      case PREDICTOR.INCREMENT: {
        const previousIteration = this.previous[fieldIndex];
        let step = 1;

        while (
          step < this.sysConfig.iInterval * 4 &&
          !iterationIsLogged(
            previousIteration + step,
            this.sysConfig.iInterval,
            this.sysConfig.pInterval
          )
        ) {
          step += 1;
        }

        return raw + previousIteration + step;
      }

      case PREDICTOR.HOME_COORD:
        return raw + (this.hasHomeCoordinates
          ? this.homeCoordinates[Math.min(fieldIndex, this.homeCoordinates.length - 1)]
          : 0);

      case PREDICTOR.VALUE_1500:
        return raw + 1500;

      case PREDICTOR.VBATREF:
        return raw + this.sysConfig.vbatref;

      case PREDICTOR.LAST_MAIN_FRAME_TIME:
        return raw + this.lastMainFrameTime;

      default:
        return raw;
    }
  }

  decodeMainFrame(isInterframe) {
    const definitions = isInterframe
      ? this.fields.inter ?? this.fields.main
      : this.fields.main;

    const raw = new Int32Array(definitions.count);
    this.readRawValues(definitions, raw);

    const current = new Int32Array(definitions.count);

    for (let i = 0; i < definitions.count; i += 1) {
      const predictor = isInterframe
        ? definitions.predictors[i]
        : this.fields.main.predictors[i];

      current[i] = this.applyPredictor(predictor, raw[i], i, current);
    }

    return current;
  }

  validateMainFrame(current, isInterframe) {
    // The byte after a healthy frame must be a frame marker
    // (or the end of the stream).
    const next = this.stream.peekByte();

    if (next !== -1 && !FRAME_MARKERS.has(next)) {
      return false;
    }

    // Time and iteration must move forward sensibly.
    if (this.hasPrevious && this.timeIndex >= 0) {
      const time = current[this.timeIndex];
      const previousTime = this.previous[this.timeIndex];
      const tenMinutesInMicroseconds = 10 * 60 * 1000 * 1000;

      if (
        time < previousTime ||
        time - previousTime > tenMinutesInMicroseconds
      ) {
        return false;
      }
    }

    if (this.hasPrevious && this.iterationIndex >= 0 && isInterframe) {
      const iteration = current[this.iterationIndex];
      const previousIteration = this.previous[this.iterationIndex];

      if (
        iteration <= previousIteration ||
        iteration - previousIteration > this.sysConfig.iInterval * 16
      ) {
        return false;
      }
    }

    return true;
  }

  acceptMainFrame(current, isInterframe) {
    if (isInterframe) {
      this.previous2.set(this.previous);
    } else {
      // An intraframe re-anchors history: both slots point
      // at it, so the first following interframe predicts
      // against the intraframe twice (per the spec model).
      this.previous2.set(current);
    }

    this.previous.set(current);
    this.hasPrevious = true;

    if (this.timeIndex >= 0) {
      this.lastMainFrameTime = current[this.timeIndex];
    }

    this.mainFrames.push(current);
  }

  decodeEventFrame() {
    const eventType = this.stream.readByte();

    if (eventType === END_OF_LOG_EVENT) {
      // Marker payload: "End of log\0"
      this.stats.endOfLogSeen = true;
      this.stream.position = this.stream.end;
      return;
    }

    // Other event payloads are variable length without a
    // length prefix. Skipping bytes until the next frame
    // marker keeps unknown events from derailing the log.
    this.events.push({ type: eventType });

    while (
      !this.stream.eof() &&
      !FRAME_MARKERS.has(this.stream.peekByte())
    ) {
      this.stream.readByte();
    }
  }

  resync(failedFrameStart) {
    this.stats.corruptFrames += 1;
    this.stream.position = failedFrameStart + 1;

    while (
      !this.stream.eof() &&
      !FRAME_MARKERS.has(this.stream.peekByte())
    ) {
      this.stream.readByte();
    }

    // A broken interframe poisons every interframe after it
    // until the next intraframe re-anchors the stream.
    this.hasPrevious = false;
  }

  decodeAll() {
    while (!this.stream.eof()) {
      const frameStart = this.stream.position;
      const marker = String.fromCharCode(this.stream.readByte());

      try {
        if (marker === "I") {
          const frame = this.decodeMainFrame(false);

          if (this.validateMainFrame(frame, false)) {
            this.stats.intraFrames += 1;
            this.acceptMainFrame(frame, false);
          } else {
            this.resync(frameStart);
          }
          continue;
        }

        if (marker === "P") {
          if (!this.hasPrevious) {
            this.resync(frameStart);
            continue;
          }

          const frame = this.decodeMainFrame(true);

          if (this.validateMainFrame(frame, true)) {
            this.stats.interFrames += 1;
            this.acceptMainFrame(frame, true);
          } else {
            this.resync(frameStart);
          }
          continue;
        }

        if (marker === "S" && this.fields.slow) {
          const raw = new Int32Array(this.fields.slow.count);
          this.readRawValues(this.fields.slow, raw);
          this.stats.slowFrames += 1;
          this.slowFrames.push({
            afterMainFrame: this.mainFrames.length - 1,
            values: raw
          });
          continue;
        }

        if (marker === "H" && this.fields.gpsHome) {
          const raw = new Int32Array(this.fields.gpsHome.count);
          this.readRawValues(this.fields.gpsHome, raw);
          this.homeCoordinates.set(raw);
          this.hasHomeCoordinates = true;
          continue;
        }

        if (marker === "G" && this.fields.gps) {
          const raw = new Int32Array(this.fields.gps.count);
          this.readRawValues(this.fields.gps, raw);
          const current = new Int32Array(this.fields.gps.count);

          for (let i = 0; i < this.fields.gps.count; i += 1) {
            current[i] = this.applyPredictor(
              this.fields.gps.predictors[i],
              raw[i],
              i,
              current
            );
          }

          this.stats.gpsFrames += 1;
          this.gpsFrames.push({
            afterMainFrame: this.mainFrames.length - 1,
            values: current
          });
          continue;
        }

        if (marker === "E") {
          this.stats.eventFrames += 1;
          this.decodeEventFrame();
          continue;
        }

        // Unknown marker byte — realign.
        this.resync(frameStart);
      } catch {
        if (this.stream.position >= this.stream.end) {
          break;
        }

        this.resync(frameStart);
      }
    }

    return {
      mainFrames: this.mainFrames,
      slowFrames: this.slowFrames,
      gpsFrames: this.gpsFrames,
      events: this.events,
      stats: this.stats
    };
  }
}
