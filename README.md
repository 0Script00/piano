# Piano

The instrument selector uses sampled General MIDI recordings from the FluidR3
soundfont via [MIDI.js Soundfonts](https://github.com/gleitz/midi-js-soundfonts).
The soundfont is distributed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Samples are loaded
on demand, so an internet connection is required to play a sampled instrument
that has not been loaded in the current page session.

The NES square/pulse and triangle instruments are generated with Web Audio
periodic waveforms and do not require external samples.
