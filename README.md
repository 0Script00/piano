# Piano

The instrument selector uses sampled General MIDI recordings from the FluidR3
soundfont via [MIDI.js Soundfonts](https://github.com/gleitz/midi-js-soundfonts).
The soundfont is distributed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Samples are loaded
on demand, so an internet connection is required to play a sampled instrument
that has not been loaded in the current page session.

The NES square/pulse and triangle instruments are generated with Web Audio
periodic waveforms and do not require external samples.

Recording can use a saved recording as a temporary background track and an
optional metronome. The metronome supports 20–300 BPM and time signatures with
1–32 beats using a half-, quarter-, eighth-, or sixteenth-note denominator.

Recordings and mixer tracks can be exported to and imported from JSON files.
Files use `"type": "recode"` for a recording or `"type": "mixed"` for mixer
tracks; each note track includes its instrument ID and stores note pitches and
durations in 0.01-second units. Mixer track volume, pan, and mute settings are
preserved as well.
