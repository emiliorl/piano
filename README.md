# Keyfall

A zero-install piano practice app that runs in the browser. Notes fall toward a hit line, and in **Wait mode** the song stops until you play the right key. Play on a real piano (through the microphone or a MIDI keyboard) or on your computer keyboard.

It is plain HTML, CSS and JavaScript modules with no build step and no dependencies. Everything runs on your machine using the Web Audio API and an HTML5 canvas.

> **About "AI":** earlier drafts of this project were called "Piano AI Practice". There is no machine learning in Keyfall. Pitch detection is classic signal processing (autocorrelation), and everything else is ordinary application code. A real ML model is listed under [Future improvements](#future-improvements).

---

## Contents
1. [Features](#features)
2. [Running it, tests and project structure](#running-it)
3. [Practice modes](#practice-modes)
4. [Songs and importing](#songs-and-importing)
5. [Ways to play](#ways-to-play)
6. [Microphone pitch detection](#microphone-pitch-detection)
7. [Sound](#sound)
8. [Settings and saved data](#settings-and-saved-data)
9. [How it fits together](#how-it-fits-together)
10. [Known limitations](#known-limitations)
11. [Troubleshooting](#troubleshooting)
12. [Future improvements](#future-improvements)
13. [Credits](#credits)

---

## Features

- **Wait mode** and **Play at tempo** mode.
- **Both hands, right hand only or left hand only**, drawn in different colours. Switching hands keeps your place.
- **MIDI file import** (`.mid`, `.midi`) with real note lengths, chords and the file's tempo, plus a simple typed-notes format.
- **Listen**: the computer plays the song (or the selected hand) back perfectly, with pause and resume.
- **Jump to any point** with a slider, the mouse wheel or the arrow keys.
- **Hold notes**: in Wait mode a note only counts once you have held it for most of its length.
- **Six sounds**: a recorded grand piano, a synth piano, electric piano, organ, soft strings and music box. Notes sustain while you hold a key.
- **Four ways to play**: microphone, USB/Bluetooth MIDI keyboard, computer keyboard, or clicking the on-screen keys.
- **Live mic readout**: shows the note the microphone hears, on the keyboard and as a name.
- **Remembers** your settings, your last song, and optionally settings for each song.

## Running it

The app uses JavaScript modules, which browsers only load over `http://`, so it needs a tiny local server (opening `index.html` directly shows a message saying so). You need Python 3.

```bash
python serve.py          # http://localhost:8000  (or: npm start)
```

Open <http://localhost:8000> in Chrome, Edge, Brave or Firefox. MIDI keyboard support needs a Chromium browser. `serve.py` tells the browser not to cache, so a normal refresh always shows the latest code. (`python -m http.server 8000` also works, but browsers may keep showing an old copy.)

The grand piano sound downloads about 2 MB of recordings the first time it is used. Without a connection it falls back to the built-in synth piano.

### Tests

```bash
npm test                 # node --test, Node 18 or newer, nothing to install
```

The tests cover the MIDI and typed-note parsers, the song library, pitch detection on generated tones, and the practice engine (Wait and tempo modes, holding, switching hands, jumping, and Listen) using a fake clock.

## Project structure

```
index.html            page markup only
css/styles.css        all styling
serve.py              no-cache dev server
js/
  main.js             entry point: creates the pieces and wires them to the page
  engine.js           practice logic: position, scoring, holding, seeking, Listen (no DOM, no audio)
  audio.js            Web Audio engine: instruments, samples, reverb
  pitch.js            monophonic pitch detection (pure function)
  mic.js              microphone capture and note events
  keyboard.js         on-screen piano and key-column geometry
  roll.js             falling-note canvas
  inputs.js           mouse/touch, computer keyboard and MIDI keyboard
  settings.js         remembered settings (localStorage)
  util.js, dom.js     small helpers
  songs/
    text.js           typed-note format
    midi.js           standard MIDI file parser
    builtin.js        the built-in songs
    library.js        built-in + imported songs, stored in the browser
  ui/
    segments.js       Both/Right/Left and Wait/Tempo button groups
    seekbar.js        jump slider and wheel scrolling
    importer.js       Import dialog and drag-and-drop
tests/                node:test files and helpers
```

The engine never touches the page. It asks for things (show a message, flash a key, start a sound) through a small `hooks` object that `main.js` provides, and takes its clock as a parameter. That is what makes it testable and keeps the page code thin.

## Practice modes

### Wait mode
The roll stops at the hit line until you play the target note.

- **Octave-free matching.** A note counts if it has the right note name in any octave (`MIDI mod 12`), so you can play on whatever part of the keyboard is comfortable.
- **Chords.** Every note of a chord must be played, in any order, before the song moves on. (The microphone is the exception, see [limitations](#known-limitations).)
- **Holding.** A correct note turns amber and fills as you hold it. It counts after about 70% of its written length (50% for the microphone), between 0.15 and 4 seconds. Letting go early resets the note so you play it again. This can be turned off in Settings.
- **Wrong notes** reset your streak. They can optionally flash red.

### Play at tempo
Notes scroll at the song's tempo (adjustable). Press **Start** and you get a two-beat count-in.

- A note is a hit if you play the right note name within **±0.4 beats** of the line.
- Notes you miss turn red; hits turn green. A summary appears at the end.
- Only the moment you start a note is judged, not how long you hold it.

### Hands
The **Both / Right / Left** buttons filter what you practise. Changing them keeps your position and score; only **Restart** starts over.

### Listen
Plays the song from your current position (or the top if you have finished) using the selected sound. Pausing keeps its position. Playing a key while paused hands control back to you at the place you left.

Switching hands while Listen is playing is seamless: the music does not stop, the hand you turned off goes quiet, and notes of the other hand that are already sounding keep ringing. Turning a hand back on brings in its notes, including ones that should already be sounding.

### Jumping
Drag the slider along the bottom, scroll the mouse wheel over the roll, or use ↑/↓ (one note or chord) and PageUp/PageDown (eight). Notes before the new start point are greyed out and not scored, and the score restarts from there.

## Songs and importing

**Built in:** Ode to Joy (one and two hands), Twinkle Twinkle Little Star, Für Elise (opening) and Canon in D (opening). These are simplified arrangements.

**Import** (the **＋ Import** button, or drag a file onto the page):

- **MIDI files.** Keeps note timing and lengths, chords and the file's first tempo. Tempo changes later in the file are ignored. Drum channel notes are skipped.
- **Typed notes.** Space-separated tokens, for example `E4+C3:2 E4 F4+G3:2 _`:
  - `C4` is a note; `C4+E4+G4` is a chord; `_` is a rest.
  - `:n` after a note sets its length in beats (default 1), for example `C4:2` or `E4:0.5`. In a chord each note can have its own length. The song moves on by the length of the first note.
- Imported songs are saved in your browser and appear with a ★. They can be deleted from the Import dialog.

**How the hands are decided:** a file with exactly two clearly separate tracks (average pitch differs by 6+ semitones) uses the higher track as the right hand. Anything else is split by pitch, with notes below middle C as the left hand. You can change the split point in Settings.

MIDI files can be found on free sites such as BitMidi and MuseScore, or exported from any notation program. PDFs and pictures of sheet music cannot be imported.

## Ways to play

### Computer keyboard
Two rows, laid out like a music-software keyboard. The letters are shown on the piano keys and slide to sit under the notes that are coming up.

| Row | Keys | Notes |
| :-- | :-- | :-- |
| Bottom | `Z X C V B N M` | C D E F G A B (white keys) |
| Bottom | `S D G H J` | C♯ D♯ F♯ G♯ A♯ (black keys) |
| Top | `Q W E R T Y U I O P` | the next octave (C to E) |
| Top | `2 3 5 6 7 9 0` | the black keys of the top row |

`←` / `→` (or `[` / `]`) shift everything by an octave, `↑` / `↓` scroll the song. Labels can be hidden in Settings.

### MIDI keyboard
Connect it before opening the page. Every key, chord and key release is read exactly, so this is the most accurate way to practise two hands. The app stays silent for MIDI input because the keyboard makes its own sound.

### Microphone
Click **Mic**, allow access, and play. See the next section.

### Mouse / touch
Click or tap the on-screen keys. Notes sustain while pressed.

## Microphone pitch detection

The microphone is analysed in the browser; no audio leaves your computer.

1. **Raw audio.** The stream is requested with echo cancellation, noise suppression and auto gain turned off, because those speech filters distort instruments.
2. **Volume gate.** A 4096-sample window is skipped if its RMS level is below the noise threshold (default 0.01, adjustable).
3. **Pitch.** A normalized square difference function (NSDF) is computed over lags covering about 60 Hz to 2100 Hz; in practice notes from about A♯1 to G♯6 are detected reliably (the tests check this), and notes above that tend to be reported an octave low. The first strong peak (at least 85% of the highest, and a clarity of 0.5 or more) is taken as the fundamental, then refined by parabolic interpolation and converted to a MIDI note.
4. **Stability.** A note must be read twice in a row, and a repeated note needs a fresh attack (a jump in volume), so one sustained note does not trigger the next. Wait mode also ignores the mic for 300 ms after a hit.
5. **Feedback.** The detected note is shown top-right and marked in amber on the keyboard.

This is **monophonic**: it reports one pitch at a time.

## Sound

Choose the instrument in Settings; it applies to keys you press and to Listen.

| Option | How it works |
| :-- | :-- |
| Grand piano (recorded) | Salamander Grand Piano samples, pitch-shifted between recorded notes. Loaded on demand; the synth piano plays until they arrive. |
| Synth piano | Additive synthesis: inharmonic partials, two slightly detuned strings, a hammer-noise burst and a two-stage decay. Works offline. |
| Electric piano | Two-operator FM with a short bell-like attack. |
| Organ | Four sine drawbars with no decay. |
| Soft strings | Two detuned sawtooth oscillators through a low-pass filter. |
| Music box | Short decaying inharmonic partials, an octave up. |

All sounds share a master volume, a compressor and an optional generated room reverb. Notes sustain while the key is held and fade quickly when it is released.

## Settings and saved data

Everything is stored in your browser's `localStorage`, so it does not travel between browsers or computers.

- **Global:** last song, keyboard range, sound options, volume, reverb, mic threshold, highlight and hold options, key-label options.
- **Per song** (if "Remember … per song" is on): hands, hand split, tempo and mode. A song you have not opened before starts with both hands and its own tempo.
- **Imported songs** are stored alongside.
- **Reset** in Settings clears the saved settings and keeps your imported songs.

## How it fits together

```
 Inputs                          Core                           Output
 ------                          ----                           ------
 Microphone -> NSDF pitch --+
 MIDI keyboard -------------+--> input() --> Wait mode  --+--> Canvas roll (60 fps)
 Computer keys -------------+                Tempo mode   |    On-screen keyboard
 Mouse / touch -------------+                              +--> Stats, status text

 Song source: built-in text | typed text | MIDI file -> notes {time, length, pitch, hand}
 Listen: schedules the same notes to the synth, no scoring
 Sound:  voice per held key -> bus -> compressor (+ reverb) -> speakers
```

A song is a list of notes with a start time and length in beats. Notes that start together form a **step** (a single note or a chord); Wait mode moves from step to step. See [Project structure](#project-structure) for where each part lives.

## Known limitations

- **The microphone hears one note at a time.** For chords, hearing any one note of the chord counts the whole chord as played, so wrong or missing notes in a chord are not caught. With both hands at once the detector usually locks onto the loudest note and can flicker. Use a MIDI keyboard, or practise one hand at a time, for accurate checking.
- **Octaves are not checked.** Any octave of the right note name is accepted.
- **Tempo changes** inside a MIDI file are ignored; the first tempo is used throughout.
- **Timing display** is in minutes and seconds, not bars, because time signatures are not read.
- **The grand piano sound needs a connection** the first time it is used.
- **Settings are per browser**, not synced.
- **Tempo mode** judges when you start a note, not how long you hold it.

## Troubleshooting

| Symptom | Likely cause | What to do |
| :-- | :-- | :-- |
| Mic does nothing | Permission blocked, or page opened as `file://` | Allow the microphone in the address bar, or serve the folder (see [Running it](#running-it)). |
| Mic triggers by itself | Threshold too low for the room | Raise **Noise threshold** in Settings. |
| Mic ignores soft notes | Threshold too high, or the piano is far away | Lower the threshold and move the mic closer. |
| Wrong note name shown | Strong overtones or two notes at once | Play one note at a time, or use a MIDI keyboard. |
| No sound | Sound switched off, or browser audio not started | Tick "Play sound on keys" and click the page once. |
| Piano sounds like a synth | Recordings still loading or offline | Wait for "Grand piano sound loaded", or check your connection. |
| Settings seem stuck | Old page cached | Hard refresh with Ctrl+Shift+R, or use **Reset** in Settings. |
| A hand button does nothing useful | The song has no notes for that hand | Try another split point in Settings. |

## Future improvements

**Accuracy**
- **Real multi-note detection from the microphone**, so chords and two-handed passages are actually checked. Either spectral analysis (chroma / harmonic peak picking) or a browser-run machine-learning model such as Spotify's Basic Pitch, which would also make "AI" in the name accurate.
- **Octave-aware checking** as an option, and detection of which specific wrong notes were played.
- **Note-length and release timing** scoring in Play at tempo mode.
- **Latency calibration** for the microphone.

**Practice tools**
- **Loop a section** (A–B repeat) with an optional tempo ramp.
- **Metronome** and count-in options.
- **Progress history** per song: accuracy over time, trouble spots, streak records.
- **Bar and beat display**, with time signatures, instead of minutes and seconds.
- **Sustain pedal** support for MIDI keyboards and on screen.

**Songs**
- **Tempo and time-signature changes** from MIDI files.
- **MusicXML import**, and possibly reading sheet music from images or PDFs.
- **Showing note names or fingering** on the falling notes.
- **A small built-in library** of public-domain pieces at several difficulty levels.

**App**
- **Installable and offline** as a Progressive Web App, with the piano samples bundled.
- **Better phone and tablet layout** with touch-friendly keys.
- **MIDI output**, so the app can drive a hardware piano or synth.
- **Syncing settings and songs** between devices.
- **Accessibility:** keyboard navigation of the controls, high-contrast and colour-blind-safe themes.
- **Wider mic range:** reliable detection above G♯6 and below A♯1, which needs a longer analysis window for the lowest notes.
- **Browser-level tests:** automated end-to-end tests of the page itself (the engine and parsers are already covered).

## Credits

- **Grand piano recordings:** Salamander Grand Piano by Alexander Holm, licensed CC-BY 3.0, loaded from the Tone.js example audio host.
- Everything else, including the pitch detection and synthesizers, is written for this project using standard browser APIs.
