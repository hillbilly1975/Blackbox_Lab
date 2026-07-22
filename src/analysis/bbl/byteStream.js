// ======================================================
// BLACKBOX LAB — BBL BYTE STREAM
// ======================================================
//
// Low-level reader for the binary Blackbox log format.
// Implements every field encoding from the published
// Blackbox format specification (clean-room, MIT-safe):
//
//   #0 SIGNED_VB    zigzag + unsigned variable byte
//   #1 UNSIGNED_VB  7 bits per byte, high bit = continue
//   #3 NEG_14BIT    negated unsigned 14-bit as UVB
//   #6 TAG8_8SVB    presence-bit header + SVB values
//   #7 TAG2_3S32    2-bit size tier for 3 signed values
//   #8 TAG8_4S16    2 bits per field sizes, nibble stream
//   #9 NULL         no bytes on the wire
//
// ======================================================

export const ENCODING = {
  SIGNED_VB: 0,
  UNSIGNED_VB: 1,
  NEG_14BIT: 3,
  TAG8_8SVB: 6,
  TAG2_3S32: 7,
  TAG8_4S16: 8,
  NULL: 9
};

function signExtend(value, bits) {
  const shift = 32 - bits;
  return (value << shift) >> shift;
}

export class ByteStream {
  constructor(bytes, start = 0, end = bytes.length) {
    this.bytes = bytes;
    this.position = start;
    this.end = end;
  }

  eof() {
    return this.position >= this.end;
  }

  peekByte() {
    if (this.eof()) {
      return -1;
    }

    return this.bytes[this.position];
  }

  readByte() {
    if (this.eof()) {
      throw new RangeError("Unexpected end of log data");
    }

    const value = this.bytes[this.position];
    this.position += 1;
    return value;
  }

  // ----------------------------------------------------
  // Encoding #1 — unsigned variable byte
  // ----------------------------------------------------
  readUnsignedVB() {
    let result = 0;
    let shift = 0;

    for (let i = 0; i < 5; i += 1) {
      const byte = this.readByte();
      result |= (byte & 0x7f) << shift;

      if ((byte & 0x80) === 0) {
        return result >>> 0;
      }

      shift += 7;
    }

    throw new RangeError("Unsigned variable byte ran past 5 bytes");
  }

  // ----------------------------------------------------
  // Encoding #0 — signed variable byte (zigzag folded)
  // ----------------------------------------------------
  readSignedVB() {
    const unsigned = this.readUnsignedVB();
    return (unsigned >>> 1) ^ -(unsigned & 1);
  }

  // ----------------------------------------------------
  // Encoding #3 — negated unsigned 14 bit
  // ----------------------------------------------------
  readNeg14Bit() {
    const unsigned = this.readUnsignedVB();
    return -signExtend(unsigned & 0x3fff, 14);
  }

  // ----------------------------------------------------
  // Encoding #6 — TAG8_8SVB
  //
  // One header byte: bit n set means field n is present
  // and follows as a signed VB. Clear bits decode to 0.
  // Groups of exactly one field skip the header entirely
  // (the specification's single-field optimisation).
  // ----------------------------------------------------
  readTag8_8SVB(values, count) {
    if (count === 1) {
      values[0] = this.readSignedVB();
      return;
    }

    let header = this.readByte();

    for (let i = 0; i < count; i += 1) {
      values[i] = (header & 1) !== 0 ? this.readSignedVB() : 0;
      header >>= 1;
    }
  }

  // ----------------------------------------------------
  // Encoding #7 — TAG2_3S32
  //
  // Top 2 bits of the first byte select the size tier for
  // three signed values:
  //   0: 00AA BBCC                   three 2-bit fields
  //   1: 0100 AAAA | BBBB CCCC       three 4-bit fields
  //   2: 10AA AAAA | 00BB BBBB | 00CC CCCC   6-bit fields
  //   3: 11ss ssss + per-field bytes (1-4, little endian)
  // ----------------------------------------------------
  readTag2_3S32(values) {
    const lead = this.readByte();
    const tier = lead >> 6;

    if (tier === 0) {
      values[0] = signExtend((lead >> 4) & 0x03, 2);
      values[1] = signExtend((lead >> 2) & 0x03, 2);
      values[2] = signExtend(lead & 0x03, 2);
      return;
    }

    if (tier === 1) {
      const second = this.readByte();
      values[0] = signExtend(lead & 0x0f, 4);
      values[1] = signExtend((second >> 4) & 0x0f, 4);
      values[2] = signExtend(second & 0x0f, 4);
      return;
    }

    if (tier === 2) {
      values[0] = signExtend(lead & 0x3f, 6);
      values[1] = signExtend(this.readByte() & 0x3f, 6);
      values[2] = signExtend(this.readByte() & 0x3f, 6);
      return;
    }

    // Tier 3 — the low 6 bits carry three 2-bit byte counts.
    for (let i = 0; i < 3; i += 1) {
      const byteCount = ((lead >> (i * 2)) & 0x03) + 1;

      let value = 0;

      for (let b = 0; b < byteCount; b += 1) {
        value |= this.readByte() << (b * 8);
      }

      values[i] = signExtend(value, byteCount * 8);
    }
  }

  // ----------------------------------------------------
  // Encoding #8 — TAG8_4S16
  //
  // One header byte, 2 bits per field (LSB pair = field 0):
  //   0: field is zero (no bits)
  //   1: 4-bit nibble
  //   2: 8 bits (two nibbles)
  //   3: 16 bits (four nibbles)
  // Values follow as a nibble stream, high nibble first.
  // ----------------------------------------------------
  readTag8_4S16(values) {
    const header = this.readByte();

    let nibbleBuffer = 0;
    let nibbleCount = 0;

    const readNibble = () => {
      if (nibbleCount === 0) {
        nibbleBuffer = this.readByte();
        nibbleCount = 2;
      }

      nibbleCount -= 1;
      return (nibbleBuffer >> (nibbleCount * 4)) & 0x0f;
    };

    for (let i = 0; i < 4; i += 1) {
      const size = (header >> (i * 2)) & 0x03;

      if (size === 0) {
        values[i] = 0;
        continue;
      }

      const nibbles = size === 1 ? 1 : size === 2 ? 2 : 4;

      let value = 0;

      for (let n = 0; n < nibbles; n += 1) {
        value = (value << 4) | readNibble();
      }

      values[i] = signExtend(value, nibbles * 4);
    }
  }
}
