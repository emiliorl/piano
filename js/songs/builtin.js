// Built-in songs in the typed-note format (see text.js). Simplified arrangements.
export const BUILTIN = {
  'Ode to Joy': 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2',
  'Ode to Joy (both hands)': 'E4+C3:2 E4 F4+G3:2 G4 G4+C3:2 F4 E4+G3:2 D4 C4+C3:2 C4 D4+G3:2 E4 E4:1.5+C3:2 D4:0.5 D4:2+G3:2',
  'Twinkle Twinkle Little Star': 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2',
  'Für Elise': 'E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 _:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1.5 _:0.5 E4:0.5 G#4:0.5 B4:0.5 C5:1.5 _:0.5 E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5',
  'Canon in D': 'F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2 D5 C#5 B4 A4 G4 F#4 G4 E4 F#5 E5 D5 C#5 B4 A4 B4 C#5',
};

/** Starting tempo (BPM) for songs that should not use the default of 70. */
export const BPMS = { 'Für Elise': 100 };
