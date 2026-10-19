# Piano AI Practice: Web Pitch Recognition & Wait Mode

An open-source, studio-grade, zero-install web application that listens to your physical acoustic piano or digital keyboard via the microphone, tracks notes in real time, and automatically pauses the song roll until you play the correct note (**Wait Mode**).

---

## Table of Contents
1. [Overview & Core Value](#overview--core-value)
2. [Key Architecture Components](#key-architecture-components)
3. [Acoustic Pitch Detection Engine (DSP)](#acoustic-pitch-detection-engine-dsp)
4. [The "Wait Mode" State Machine](#the-wait-mode-state-machine)
5. [Input Subsystems: Mic, QWERTY, MIDI & Touch](#input-subsystems-mic-qwerty-midi--touch)
6. [Interactive Canvas Piano Roll & Visual Keyboard](#interactive-canvas-piano-roll--visual-keyboard)
7. [Built-in Synthesizer (Web Audio API)](#built-in-synthesizer-web-audio-api)
8. [File Structure & How to Run](#file-structure--how-to-run)
9. [Troubleshooting & Tuning](#troubleshooting--tuning)

---

## 1. Overview & Core Value

Commercial apps (such as Flowkey, Skoove, and Yousician) provide "Wait Mode," where sheet music or falling notes freeze until the player hits the target note on an acoustic instrument. However, these apps gate their song libraries behind subscription paywalls.

This project recreates that exact functionality entirely in client-side HTML, CSS, and modern JavaScript using the native **Web Audio API** and **HTML5 Canvas**.

### Main Capabilities:
- **Zero Installation:** Runs directly in Chromium, Firefox, and Safari on Windows, macOS, Linux, and Android.
- **Microphone Pitch Recognition:** Disables browser noise filters and uses an autocorrelation/NSDF algorithm to isolate fundamental piano frequencies ($C_2$ through $C_7$).
- **Strict Wait Mode:** Notes freeze on the hit baseline; the song engine only advances upon hearing or receiving the matching pitch.
- **Physical QWERTY Input:** Seamlessly practice without an instrument using your computer keyboard.
- **Curated Songbook & Importer:** Built-in pieces (*Ode to Joy*, *Für Elise*, *Canon in D*, *Twinkle Twinkle Little Star*) plus an interactive note sequence parser.

---

## 2. Key Architecture Components

```
+-------------------------------------------------------------+
|                        User Inputs                          |
|   +----------------+   +-----------------+   +------------+ |
|   | Acoustic Mic   |   | QWERTY Keyboard |   | Touch/MIDI | |
|   +-------+--------+   +--------+--------+   +-----+------+ |
+-----------|---------------------|------------------|--------+
            | (Raw Audio Stream)  | (Key Events)     | (MIDI Note)
            v                     |                  |
+---------------------------+     |                  |
| Web Audio DSP Pipeline    |     |                  |
| - getUserMedia (Raw)      |     |                  |
| - RMS Gate (Noise Floor)  |     |                  |
| - NSDF / Auto-Correlation |     |                  |
| - Sub-sample Interpolation|     |                  |
+-------------+-------------+     |                  |
              |                   |                  |
              +---------> [ Note Dispatcher ] <------+
                                  |
                                  v
+-------------------------------------------------------------+
|                    Wait Mode Engine                         |
|  - Compares Input Pitch Class with Target Song Note         |
|  - Debounce Guard (300ms window)                            |
|  - Correct Note  -> Advance Index + Increment Streak + UI   |
|  - Mismatch Note -> Visual Feedback (Red Alert)             |
+-----------------------------+-------------------------------+
                              |
              +---------------+---------------+
              |                               |
              v                               v
+---------------------------+   +-----------------------------+
|    60 FPS Canvas Roll     |   | Dynamic Interactive Keyboard|
| - Target hit-line glow    |   | - Key states: Waiting (Cyan)|
| - Real-time note descent  |   |   Correct (Green), Bad (Red)|
+---------------------------+   +-----------------------------+
```

---

## 3. Acoustic Pitch Detection Engine (DSP)

Acoustic piano pitch detection poses unique challenges because hammered strings produce rich overtones and hammer strike transients.

### Step 1: Disabling Speech Pre-Processing
Default browser microphone streams enable speech-centric filters that distort musical instruments. We request the stream with raw attributes:
```javascript
navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false
  }
});
```

### Step 2: RMS Noise Gate (Energy Threshold)
Before performing calculations, the engine computes the Root-Mean-Square (RMS) amplitude of the 2048-sample buffer:
$$RMS = \sqrt{\frac{1}{N} \sum_{n=0}^{N-1} x[n]^2}$$
If $RMS < \text{noiseThreshold}$ (default $0.025$), the audio is discarded as room hiss or background noise.

### Step 3: Normalized Square Difference Function (NSDF)
To find the fundamental period $\tau$ independent of signal volume, we use autocorrelation over the piano range (periods corresponding to $\approx 60\text{ Hz}$ up to $\approx 2100\text{ Hz}$):
$$r_t(\tau) = \frac{\sum_{j} x_j x_{j+\tau}}{\sqrt{\sum_{j} x_j^2 \cdot \sum_{j} x_{j+\tau}^2} + \epsilon}$$

### Step 4: Parabolic Peak Interpolation
To achieve sub-sample pitch accuracy (avoiding quantized pitch jitter), the peak index is refined using quadratic interpolation with its neighbors $y_1$, $y_2$, and $y_3$:
$$\delta = \frac{y_3 - y_1}{2(2y_2 - y_1 - y_3)}$$
$$\text{Sample Period} = \tau_{\text{peak}} + \delta$$
$$f = \frac{\text{Sample Rate}}{\text{Sample Period}}$$

### Step 5: Frequency to MIDI Conversion
The calculated fundamental frequency $f$ is converted into standard MIDI note numbers:
$$\text{MIDI} = \text{round}\left(69 + 12 \cdot \log_2\left(\frac{f}{440}\right)\right)$$

---

## 4. The "Wait Mode" State Machine

In traditional rhythm games, notes scroll continuously regardless of player performance. In **Wait Mode**:

1. **State: Pending Target Note**
   - The current target note index is $i$.
   - The note scrolls down until its bottom edge touches the hit baseline ($y = \text{baseline}$).
   - The transport pauses its movement.
2. **State: Evaluating Pitch Input**
   - When an input note $\text{MIDI}_{\text{in}}$ arrives (via Mic, QWERTY, or Click):
     - **Exact or Octave Equivalence Check:**
       $$(\text{MIDI}_{\text{in}} \pmod{12}) = (\text{MIDI}_{\text{target}} \pmod{12})$$
       *(Allows playing the melody in comfortable octaves without triggering penalties).*
3. **Branch A: Match Detected**
   - Audio synthesized chime triggers.
   - On-screen key flashes emerald green (`key-detected-correct`).
   - Streak and accuracy statistics increment.
   - Song index increments: $i \leftarrow i + 1$.
   - Note roll resumes movement toward $i + 1$.
4. **Branch B: Mismatch Detected**
   - On-screen key flashes coral red (`key-detected-wrong`).
   - Current streak resets to 0.
   - The engine stays at index $i$, awaiting the correct pitch.

---

## 5. Input Subsystems: Mic, QWERTY, MIDI & Touch

### Computer QWERTY Keyboard Mapping
To enable practice on laptops without an external instrument or quiet environments:

| QWERTY Key | Musical Note | Key Type |
| :--- | :--- | :--- |
| `A`, `S`, `D`, `F` | $C_4$, $D_4$, $E_4$, $F_4$ | White Keys |
| `G`, `H`, `J`, `K`, `L`, `;`, `'` | $G_4$, $A_4$, $B_4$, $C_5$, $D_5$, $E_5$, $F_5$ | White Keys |
| `W`, `E` | $C^\sharp_4$, $D^\sharp_4$ | Black Keys |
| `T`, `Y`, `U` | $F^\sharp_4$, $G^\sharp_4$, $A^\sharp_4$ | Black Keys |
| `O`, `P` | $C^\sharp_5$, $D^\sharp_5$ | Black Keys |
| `Z` / `X` | Transpose Octave Down / Up | Function |

### Web MIDI Plug & Play
Modern Chromium browsers support native USB MIDI keyboards via `navigator.requestMIDIAccess`. Connected keyboards transmit note-on velocity data directly into the input dispatcher without microphone latency.

---

## 6. Interactive Canvas Piano Roll & Visual Keyboard

### 60 FPS Falling Notes Engine
- Built using an optimized HTML5 2D Canvas render loop driven by `requestAnimationFrame`.
- Notes are rendered as rounded pills with translucent bodies and bright borders.
- The active waiting note pulses with an ambient cyan glow to highlight the target key on screen.

### Procedural SVG/HTML5 Piano Keyboard
- Automatically constructs white and black keys based on user-selected range ($C_3-C_5$, $C_2-C_6$, or the full 88-key $A_0-C_8$).
- Black keys are placed dynamically with coordinate offsets based on standard acoustic piano geometry:
  $$\text{Offset} = \text{left}(\text{WhiteKey}_{n}) + \text{width} - \frac{\text{blackWidth}}{2}$$

---

## 7. Built-in Synthesizer (Web Audio API)

When you hit a key or enable accompaniment, the app synthesizes a rich acoustic-style piano timbre without external audio samples or soundfont libraries:
- **Dual Oscillators:**
  - `Oscillator 1` (Triangle wave): Fundamental tone body.
  - `Oscillator 2` (Sine wave at $2\times$ frequency): Sweet second harmonic overtone.
- **Dynamic ADSR Envelopes:**
  - Instant attack ($t = 0$).
  - Exponential decay to eliminate clicks:
    $$\text{Gain}(t) = \text{Gain}_0 \cdot e^{-k t}$$

---

## 8. File Structure & How to Run

The entire application is completely self-contained within a **single file**:

```
piano-ai/
└── index.html      # Complete UI, Canvas, Pitch DSP, Synthesizer & Logic
```

### Running Locally:
1. Save `index.html` on your computer.
2. Double-click the file to open it in **Google Chrome**, **Microsoft Edge**, **Brave**, or **Firefox**.
3. *Microphone Permission Note:* Browsers permit microphone access on `localhost` or via `https://`. If you open the file directly via `file:///` and your browser restricts mic access, run a simple local web server:
   ```bash
   # Using Python 3
   python -m http.server 8000
   ```
   Then open `http://localhost:8000` in your browser.

---

## 9. Troubleshooting & Tuning

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **Notes not advancing with mic** | Ambient noise floor is too high or mic is too far from piano | Open **Settings** (gear icon) and lower the **Microphone Noise Threshold** slider (e.g., to `0.015 RMS`). |
| **Octave jumping (e.g., detects $C_5$ instead of $C_4$)** | Strong piano harmonics/overtones | The engine has built-in pitch-class matching ($C_4$ and $C_5$ both qualify as $C$). Ensure the instrument is tuned to concert pitch ($A = 440\text{ Hz}$). |
| **Browser mic permission denied** | Browser security policy | Ensure you allow microphone access in your browser address bar (lock/settings icon next to the URL). |
| **Audio click or delayed response** | Suspended Web Audio Context | Click anywhere on the webpage or press **Enable Mic** to wake up the browser's audio hardware. |