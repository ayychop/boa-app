"""Finds the bass hits in each ringtone loop and writes a vibration pattern that lands on them.

Run from the repo root after changing a ringtone:

    python3 scripts/ringtone-haptics.py > src/calls/ringtoneHaptics.js

Plain Python (no numpy): low-passes each loop to the kick and bass band,
takes its energy in 10 ms frames, and marks the sharp rises (the hits). Each
hit becomes a buzz, longer for a harder hit; the pattern spans exactly one
loop, so it repeats in step with the ringtone.
"""

import glob
import math
import os
import struct
import wave

FRAME_MS = 10
CUTOFF_HZ = 140
MIN_GAP_MS = 150
THRESHOLD = 0.32  # of the loop's hardest hit
BUZZ_MS = (55, 130)  # a light hit, the hardest hit


def lowpass(samples, rate, cutoff):
    rc = 1.0 / (2 * math.pi * cutoff)
    a = (1.0 / rate) / (rc + 1.0 / rate)
    out, y1, y2 = [], 0.0, 0.0
    for s in samples:
        y1 += a * (s - y1)
        y2 += a * (y1 - y2)  # two poles: a steeper slope, less hi-hat
        out.append(y2)
    return out


def hits(path):
    w = wave.open(path)
    rate, n, width, channels = w.getframerate(), w.getnframes(), w.getsampwidth(), w.getnchannels()
    raw = w.readframes(n)
    assert width == 2, f"{path}: 16-bit WAV expected"
    values = struct.unpack(f"<{n * channels}h", raw)
    mono = [sum(values[i : i + channels]) / channels / 32768.0 for i in range(0, len(values), channels)]
    low = lowpass(mono, rate, CUTOFF_HZ)
    step = rate * FRAME_MS // 1000
    env = [math.sqrt(sum(x * x for x in low[i : i + step]) / step) for i in range(0, len(low) - step, step)]
    rise = [max(0.0, env[i] - env[i - 1]) if i else 0.0 for i in range(len(env))]
    top = max(rise) or 1.0
    found, last = [], -10**9
    for i, r in enumerate(rise):
        window = rise[max(0, i - 5) : i + 6]
        t = i * FRAME_MS
        if r >= THRESHOLD * top and r == max(window) and t - last >= MIN_GAP_MS:
            found.append((t, r / top))
            last = t
    return found, round(n / rate * 1000)


def pattern(found, loop_ms):
    """Android's [wait, buzz, wait, buzz, ...], exactly one loop long."""
    if not found:
        return [0, 400, max(0, loop_ms - 400)]
    out, at = [], 0
    for i, (t, strength) in enumerate(found):
        buzz = round(BUZZ_MS[0] + (BUZZ_MS[1] - BUZZ_MS[0]) * strength)
        nxt = found[i + 1][0] if i + 1 < len(found) else loop_ms + found[0][0]
        buzz = min(buzz, max(20, nxt - t - 40))
        out += [t - at, buzz]
        at = t + buzz
    # The last wait runs to the end of the loop; the first wait starts the next.
    out.append(max(0, loop_ms - at))
    return out


def main():
    print("// Written by scripts/ringtone-haptics.py from the ringtone loops: do not edit by hand.")
    print("// Each is Android's vibration pattern ([wait, buzz, wait, buzz, ...], ms), one loop")
    print("// long, with a buzz on every bass hit (longer for a harder one), so it repeats in step.")
    print("export const RINGTONE_HAPTICS = {")
    for path in sorted(glob.glob("assets/sounds/ringtones/*.wav")):
        found, loop_ms = hits(path)
        p = pattern(found, loop_ms)
        name = os.path.splitext(os.path.basename(path))[0]
        print(f"  {name}: {p},")
    print("};")


if __name__ == "__main__":
    main()
