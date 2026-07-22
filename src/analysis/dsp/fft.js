// ======================================================
// BLACKBOX LAB — DSP: FFT & NOISE SPECTRUM
// ======================================================
//
// A small, dependency-free radix-2 FFT plus a Welch-style
// averaged power spectrum. This is what lets the Filter
// Lab SHOW noise instead of only describing it: feed it a
// gyro trace and it returns "how much vibration lives at
// each frequency".
//
// ======================================================

// In-place iterative radix-2 FFT on interleaved buffers.
function fftInPlace(real, imag) {
  const n = real.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;

    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }

    j ^= bit;

    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < n; i += length) {
      let curReal = 1;
      let curImag = 0;

      for (let j = 0; j < length / 2; j += 1) {
        const evenReal = real[i + j];
        const evenImag = imag[i + j];
        const oddReal =
          real[i + j + length / 2] * curReal -
          imag[i + j + length / 2] * curImag;
        const oddImag =
          real[i + j + length / 2] * curImag +
          imag[i + j + length / 2] * curReal;

        real[i + j] = evenReal + oddReal;
        imag[i + j] = evenImag + oddImag;
        real[i + j + length / 2] = evenReal - oddReal;
        imag[i + j + length / 2] = evenImag - oddImag;

        const nextReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = nextReal;
      }
    }
  }
}

function hannWindow(length) {
  const window = new Float64Array(length);

  for (let i = 0; i < length; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
  }

  return window;
}

// ------------------------------------------------------
// computeNoiseSpectrum(samples, sampleRateHz, options)
//
// Welch's method: split the signal into overlapping,
// Hann-windowed segments, FFT each, average the power.
// Returns { frequencies, magnitudes } ready to plot.
// ------------------------------------------------------
export function computeNoiseSpectrum(samples, sampleRateHz, options = {}) {
  const values = Array.isArray(samples)
    ? Float64Array.from(samples)
    : samples;

  if (!values || values.length < 64 || !Number.isFinite(sampleRateHz)) {
    return null;
  }

  const maxSegment = options.segmentSize ?? 4096;

  let segmentSize = 64;

  while (segmentSize * 2 <= Math.min(values.length, maxSegment)) {
    segmentSize *= 2;
  }

  const hop = segmentSize / 2; // 50% overlap
  const window = hannWindow(segmentSize);
  const half = segmentSize / 2;

  const power = new Float64Array(half);
  let segments = 0;

  // Remove the DC offset so bin 0 doesn't swamp the plot.
  let mean = 0;

  for (let i = 0; i < values.length; i += 1) {
    mean += values[i];
  }

  mean /= values.length;

  const real = new Float64Array(segmentSize);
  const imag = new Float64Array(segmentSize);

  for (
    let start = 0;
    start + segmentSize <= values.length;
    start += hop
  ) {
    for (let i = 0; i < segmentSize; i += 1) {
      real[i] = (values[start + i] - mean) * window[i];
      imag[i] = 0;
    }

    fftInPlace(real, imag);

    for (let bin = 0; bin < half; bin += 1) {
      power[bin] +=
        (real[bin] * real[bin] + imag[bin] * imag[bin]) / segmentSize;
    }

    segments += 1;
  }

  if (segments === 0) {
    return null;
  }

  const frequencies = new Float64Array(half);
  const magnitudes = new Float64Array(half);

  for (let bin = 0; bin < half; bin += 1) {
    frequencies[bin] = (bin * sampleRateHz) / segmentSize;
    magnitudes[bin] = Math.sqrt(power[bin] / segments);
  }

  return {
    frequencies,
    magnitudes,
    segmentSize,
    segments,
    sampleRateHz
  };
}

// Estimate the sample rate from the time column (microseconds).
export function estimateSampleRate(timeValuesMicroseconds) {
  if (!timeValuesMicroseconds || timeValuesMicroseconds.length < 2) {
    return null;
  }

  const first = timeValuesMicroseconds[0];
  const last = timeValuesMicroseconds[timeValuesMicroseconds.length - 1];
  const spanSeconds = (last - first) / 1_000_000;

  if (spanSeconds <= 0) {
    return null;
  }

  return (timeValuesMicroseconds.length - 1) / spanSeconds;
}
