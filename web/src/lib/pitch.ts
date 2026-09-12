/**
 * Monophonic pitch detection for a plucked guitar string.
 *
 * The McLeod Pitch Method (MPM): a normalised square-difference function
 * (NSDF) whose peaks sit in [-1, 1], then pick the *first* peak that clears a
 * fraction of the tallest one. Taking the first strong peak rather than the
 * tallest is what avoids the octave / sub-harmonic errors a plain
 * autocorrelation makes on a harmonically rich signal like a guitar string.
 * The lag search is bounded to the guitar's range so it stays cheap per frame.
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Fundamental frequency (Hz) of `buf`, or -1 if there's no clear pitch. */
export function detectPitch(buf: Float32Array, sampleRate: number): number {
  const size = buf.length;

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.006) return -1; // too quiet to trust

  const window = size >> 1;
  const minLag = Math.max(2, Math.floor(sampleRate / 1400));
  const maxLag = Math.min(Math.floor(sampleRate / 55), window - 2);
  if (maxLag <= minLag + 2) return -1;

  // NSDF over a fixed-size window so peak heights are comparable across lags.
  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    let m = 0;
    for (let i = 0; i < window; i++) {
      const a = buf[i];
      const b = buf[i + lag];
      r += a * b;
      m += a * a + b * b;
    }
    nsdf[lag] = m > 0 ? (2 * r) / m : 0;
  }

  // The local maximum inside each positive lobe of the NSDF.
  const peaks: number[] = [];
  let inLobe = false;
  let peakLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const v = nsdf[lag];
    if (!inLobe) {
      if (v > 0) {
        inLobe = true;
        peakLag = lag;
      }
    } else if (v <= 0) {
      if (peakLag >= 0) peaks.push(peakLag);
      inLobe = false;
      peakLag = -1;
    } else if (v > nsdf[peakLag]) {
      peakLag = lag;
    }
  }
  if (inLobe && peakLag >= 0) peaks.push(peakLag);
  if (peaks.length === 0) return -1;

  let tallest = 0;
  for (const p of peaks) if (nsdf[p] > tallest) tallest = nsdf[p];
  if (tallest < 0.5) return -1; // no convincing periodicity

  const chosen = peaks.find((p) => nsdf[p] >= 0.87 * tallest) ?? peaks[0];
  if (nsdf[chosen] < 0.55) return -1;

  // Parabolic interpolation around the chosen peak → sub-sample period.
  const left = nsdf[chosen - 1] ?? nsdf[chosen];
  const right = nsdf[chosen + 1] ?? nsdf[chosen];
  const denom = left + right - 2 * nsdf[chosen];
  const shift = denom !== 0 ? (0.5 * (left - right)) / denom : 0;
  const period = chosen + shift;

  const freq = sampleRate / period;
  return freq >= 40 && freq <= 1500 ? freq : -1;
}

export interface NoteReading {
  name: string;
  octave: number;
  /** Signed cents from the nearest equal-tempered note (−50…+50). */
  cents: number;
}

/** Nearest equal-tempered note to `freq` and how far off it is, in cents. */
export function freqToNote(freq: number): NoteReading {
  const midiFloat = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(midiFloat);
  return {
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: Math.round((midiFloat - midi) * 100),
  };
}

/** Signed cents from `freq` to `target` (positive = sharp). */
export const centsFrom = (freq: number, target: number): number =>
  1200 * Math.log2(freq / target);

/** Median of a list — the smoothing that keeps the needle from jittering. */
export function median(xs: number[]): number {
  if (xs.length === 0) return -1;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
