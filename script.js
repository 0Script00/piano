const notes = [
	{ name: "도", note: "C", key: "A", code: "KeyA", black: false },
	{ name: "도#", note: "C#", key: "W", code: "KeyW", black: true },
	{ name: "레", note: "D", key: "S", code: "KeyS", black: false },
	{ name: "레#", note: "D#", key: "E", code: "KeyE", black: true },
	{ name: "미", note: "E", key: "D", code: "KeyD", black: false },
	{ name: "파", note: "F", key: "F", code: "KeyF", black: false },
	{ name: "파#", note: "F#", key: "T", code: "KeyT", black: true },
	{ name: "솔", note: "G", key: "G", code: "KeyG", black: false },
	{ name: "솔#", note: "G#", key: "Y", code: "KeyY", black: true },
	{ name: "라", note: "A", key: "H", code: "KeyH", black: false },
	{ name: "라#", note: "A#", key: "U", code: "KeyU", black: true },
	{ name: "시", note: "B", key: "J", code: "KeyJ", black: false },
];

const whiteKeys = document.querySelector("#white-keys");
const blackKeys = document.querySelector("#black-keys");
const keyGuide = document.querySelector("#key-guide");
const octaveValue = document.querySelector("#octave-value");
const rangeLabel = document.querySelector("#range-label");
const keyboard = document.querySelector("#keyboard");
const recordButton = document.querySelector("#record-toggle");
const recordLabel = document.querySelector("#record-label");
const playButton = document.querySelector("#play-recording");
const playLabel = document.querySelector("#play-label");
const clearButton = document.querySelector("#clear-recording");
const recordingStatus = document.querySelector("#recording-status");
const recordingNameInput = document.querySelector("#recording-name");
const saveRecordingButton = document.querySelector("#save-recording");
const exportRecordingButton = document.querySelector("#export-recording");
const savedRecordingsElement = document.querySelector("#saved-recordings");
const jsonFileInput = document.querySelector("#json-file-input");
const exportMixButton = document.querySelector("#export-mix-json");
const importRecordingButton = document.querySelector("#import-recording-json");
const importMixButton = document.querySelector("#import-mix-json");
const backgroundRecordingEnabled = document.querySelector("#background-recording-enabled");
const backgroundRecordingSelect = document.querySelector("#background-recording-select");
const metronomeEnabled = document.querySelector("#metronome-enabled");
const metronomeBpmInput = document.querySelector("#metronome-bpm");
const metronomeBeatsInput = document.querySelector("#metronome-beats");
const metronomeDenominatorSelect = document.querySelector("#metronome-denominator");
const instrumentSelect = document.querySelector("#instrument-select");
const instrumentLabel = document.querySelector("#instrument-label");
const siteVolume = document.querySelector("#site-volume");
const siteVolumeValue = document.querySelector("#site-volume-value");
const audioStatus = document.querySelector("#audio-status");
const addTrackButton = document.querySelector("#add-mixer-track");
const mixerTracksElement = document.querySelector("#mixer-tracks");
const playMixButton = document.querySelector("#play-mix");
const mixPlayLabel = document.querySelector("#mix-play-label");
const clearMixButton = document.querySelector("#clear-mix");
const heldCodes = new Set();
const activeVoices = new Map();
const keyElements = new Map();
const pitchNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const recordingEvents = [];
const recordingTokens = new Set();
const playbackTimers = [];
const recordingStorageKey = "key-piano-recordings-v1";
const mixerStorageKey = "key-piano-mixer-v1";
const soundfontBaseUrl = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/";
const soundfonts = {
	piano: "acoustic_grand_piano",
	electric: "electric_piano_1",
	organ: "drawbar_organ",
	ocarina: "ocarina",
	flute: "flute",
	trombone: "trombone",
	violin: "violin",
	cello: "cello",
	harmonica: "harmonica",
	"french-horn": "french_horn",
	harp: "orchestral_harp",
};
const nesWaveforms = new Map([
	["nes-square", 0.25],
	["nes-triangle", "triangle"],
]);
const instrumentIds = new Set([...Object.keys(soundfonts), ...nesWaveforms.keys()]);
const soundfontPromises = new Map();
const sampleBufferPromises = new Map();
const soundfontScripts = new Map();
let nesWaveCache;
let savedRecordings = [];
let mixerTracks = [];
let loadedRecordingId = null;
let baseOctave = 4;
let audioContext;
let masterGain;
let outputLimiter;
let recordingStartedAt = 0;
let isRecording = false;
let isPlaying = false;
let isMixPlaying = false;
let mixPlaybackTimers = [];
let backgroundPlaybackTimers = [];
let metronomeSchedulerTimer = null;
let nextMetronomeBeatTime = 0;
let metronomeBeatIndex = 0;
const metronomeNodes = new Set();

function positionBlackKey(button, whiteIndex) {
	const anchorWhiteKey = whiteKeys.children[whiteIndex];
	if (!anchorWhiteKey) {
		button.style.left = `${((whiteIndex + 0.69) / 52) * 100}%`;
		return;
	}

	const leftOffset = anchorWhiteKey.offsetLeft + anchorWhiteKey.offsetWidth * 0.68;
	button.style.left = `${leftOffset}px`;
}

function createKey(note, midi, whiteIndex) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = `piano-key ${note.black ? "black-key" : "white-key"}`;
	button.dataset.octave = note.octave;
	button.dataset.midi = midi;
	button.dataset.note = note.note;
	button.setAttribute("aria-label", `${note.note}${note.octave}`);
	button.innerHTML = `<span class="key-note">${note.note}</span><span class="key-letter"></span>`;
	if (note.black) positionBlackKey(button, Math.max(0, whiteIndex - 1));
	keyElements.set(midi, button);

	button.addEventListener("pointerdown", (event) => {
		event.preventDefault();
		button.setPointerCapture(event.pointerId);
		startNote(`pointer-${event.pointerId}`, note, midi, button);
	});
	button.addEventListener("pointerup", (event) => stopNote(`pointer-${event.pointerId}`));
	button.addEventListener("pointercancel", (event) => stopNote(`pointer-${event.pointerId}`));
	button.addEventListener("lostpointercapture", (event) => stopNote(`pointer-${event.pointerId}`));
	return button;
}

let whiteIndex = 0;
for (let midi = 21; midi <= 108; midi += 1) {
	const pitchClass = midi % 12;
	const note = {
		note: pitchNames[pitchClass],
		octave: Math.floor(midi / 12) - 1,
		black: [1, 3, 6, 8, 10].includes(pitchClass),
	};
	const button = createKey(note, midi, whiteIndex);
	if (note.black) blackKeys.append(button);
	else {
		whiteKeys.append(button);
		whiteIndex += 1;
	}
}

	notes.forEach((note) => {
	const guide = document.createElement("div");
	guide.className = "guide-key";
	guide.innerHTML = `<span class="guide-letter">${note.key}</span><span class="guide-note">${note.name}</span>`;
	keyGuide.append(guide);
});

function getOctaveOffset() {
	const controlHeld = heldCodes.has("ControlLeft") || heldCodes.has("ControlRight");
	if (controlHeld && heldCodes.has("ShiftLeft")) return 2;
	if (controlHeld) return 1;
	if (heldCodes.has("ShiftLeft") && heldCodes.has("ShiftRight")) return -2;
	if (heldCodes.has("ShiftLeft")) return -1;
	return 0;
}

function currentOctave() {
	return Math.max(1, Math.min(7, baseOctave + getOctaveOffset()));
}

function updateOctave() {
	const octave = currentOctave();
	octaveValue.textContent = `C${octave}`;
	rangeLabel.textContent = `ACTIVE C${octave}`;
	for (const [midi, button] of keyElements) {
		const isCurrentOctave = Number(button.dataset.octave) === octave;
		button.classList.toggle("is-current-octave", isCurrentOctave);
		const mappedNote = notes[midi % 12];
		button.querySelector(".key-letter").textContent = isCurrentOctave && mappedNote ? mappedNote.key : "";
	}
	const firstKey = keyElements.get((octave + 1) * 12);
	if (firstKey) keyboard.scrollLeft = firstKey.offsetLeft + whiteKeys.offsetLeft - keyboard.clientWidth / 2;
}

function updateRecorder() {
	recordButton.classList.toggle("is-recording", isRecording);
	recordLabel.textContent = isRecording ? "녹음 중지" : "녹음";
	playLabel.textContent = isPlaying ? "정지" : "재생";
	recordButton.disabled = isPlaying || isMixPlaying;
	playButton.disabled = isRecording || isMixPlaying || recordingEvents.length === 0;
	clearButton.disabled = isRecording || isPlaying || isMixPlaying || recordingEvents.length === 0;
	saveRecordingButton.disabled = isRecording || isPlaying || isMixPlaying || recordingEvents.length === 0;
	exportRecordingButton.disabled = isRecording || isPlaying || isMixPlaying || recordingEvents.length === 0;
	addTrackButton.disabled = isRecording || isPlaying || isMixPlaying || recordingEvents.length === 0;
	backgroundRecordingEnabled.disabled = isRecording || savedRecordings.length === 0;
	backgroundRecordingSelect.disabled = isRecording || savedRecordings.length === 0;
	metronomeEnabled.disabled = isRecording;
	metronomeBpmInput.disabled = isRecording;
	metronomeBeatsInput.disabled = isRecording;
	metronomeDenominatorSelect.disabled = isRecording;
	const noteCount = recordingEvents.filter((event) => event.type === "on").length;
	recordingStatus.textContent = isRecording ? "REC · 녹음 중" : isMixPlaying ? "MIX · 재생 중" : noteCount ? `${noteCount}개 음 녹음됨` : "녹음 없음";
	playMixButton.disabled = isRecording || isPlaying || mixerTracks.length === 0;
	mixPlayLabel.textContent = isMixPlaying ? "믹스 정지" : "믹스 재생";
	clearMixButton.disabled = isMixPlaying || mixerTracks.length === 0;
	exportMixButton.disabled = isRecording || isPlaying || isMixPlaying || mixerTracks.length === 0;
}

function captureRecordingEvent(type, token, midi, instrument = instrumentSelect.value) {
	if (!isRecording || token.startsWith("background-")) return;
	if (type === "off" && !recordingTokens.has(token)) return;
	if (type === "on") recordingTokens.add(token);
	else recordingTokens.delete(token);
	recordingEvents.push({ type, token, midi, instrument, time: performance.now() - recordingStartedAt });
}

function getAudioContext() {
	audioContext ??= new AudioContext();
	if (!masterGain) {
		masterGain = audioContext.createGain();
		masterGain.gain.value = 1.5 * (Number(siteVolume.value) / 100);
		outputLimiter = audioContext.createDynamicsCompressor();
		outputLimiter.threshold.value = -1;
		outputLimiter.knee.value = 0;
		outputLimiter.ratio.value = 12;
		outputLimiter.attack.value = 0.003;
		outputLimiter.release.value = 0.18;
		masterGain.connect(outputLimiter);
		outputLimiter.connect(audioContext.destination);
	}
	if (audioContext.state === "suspended") audioContext.resume();
	return audioContext;
}

function updateSiteVolume() {
	const volume = Number(siteVolume.value);
	siteVolumeValue.value = `${volume}%`;
	siteVolumeValue.textContent = `${volume}%`;
	if (audioContext && masterGain) {
		masterGain.gain.setTargetAtTime(1.5 * (volume / 100), audioContext.currentTime, 0.025);
	}
}

function createNesWave(samples) {
	const real = new Float32Array(samples.length / 2 + 1);
	const imaginary = new Float32Array(samples.length / 2 + 1);
	for (let harmonic = 1; harmonic < real.length; harmonic += 1) {
		for (let index = 0; index < samples.length; index += 1) {
			const phase = (2 * Math.PI * harmonic * index) / samples.length;
			real[harmonic] += (2 / samples.length) * samples[index] * Math.cos(phase);
			imaginary[harmonic] += (2 / samples.length) * samples[index] * Math.sin(phase);
		}
	}
	return getAudioContext().createPeriodicWave(real, imaginary);
}

function getNesWaveform(instrument) {
	if (!nesWaveCache) {
		const squareDuty = nesWaveforms.get("nes-square");
		const squareSamples = Array.from({ length: 32 }, (_, index) => index < 32 * squareDuty ? 1 : -1);
		const triangleSamples = Array.from({ length: 32 }, (_, index) => {
			const step = index % 32;
			return step < 16 ? 1 - step / 8 : -1 + (step - 16) / 8;
		});
		nesWaveCache = new Map([
			["nes-square", createNesWave(squareSamples)],
			["nes-triangle", createNesWave(triangleSamples)],
		]);
	}
	return nesWaveCache.get(instrument);
}

function midiForSampleName(name) {
	const match = /^([A-G]#?)(-?\d+)$/.exec(name);
	if (!match) return null;
	const pitch = pitchNames.indexOf(match[1]);
	return pitch < 0 ? null : (Number(match[2]) + 1) * 12 + pitch;
}

function loadSoundfont(instrument) {
	const soundfont = soundfonts[instrument];
	if (!soundfont) return Promise.reject(new Error(`Unknown instrument: ${instrument}`));
	if (soundfontPromises.has(instrument)) return soundfontPromises.get(instrument);

	const promise = new Promise((resolve, reject) => {
		const existing = soundfontScripts.get(instrument);
		const script = existing ?? document.createElement("script");
		const onLoad = () => {
			const samples = window.MIDI?.Soundfont?.[soundfont];
			if (!samples || Object.keys(samples).length === 0) {
				reject(new Error(`The ${instrument} soundfont contains no samples`));
				return;
			}
			resolve(new Map(Object.entries(samples)
				.map(([name, data]) => [midiForSampleName(name), data])
				.filter(([midi]) => midi !== null)));
		};
		script.addEventListener("load", onLoad, { once: true });
		script.addEventListener("error", () => reject(new Error(`Could not load the ${instrument} soundfont`)), { once: true });
		if (!existing) {
			script.src = `${soundfontBaseUrl}${soundfont}-mp3.js`;
			script.async = true;
			soundfontScripts.set(instrument, script);
			document.head.append(script);
		}
	});

	soundfontPromises.set(instrument, promise);
	promise.catch(() => {
		soundfontPromises.delete(instrument);
		soundfontScripts.get(instrument)?.remove();
		soundfontScripts.delete(instrument);
	});
	return promise;
}

function loadSampleBuffer(instrument, sampleMidi, sampleData) {
	const key = `${instrument}:${sampleMidi}`;
	if (sampleBufferPromises.has(key)) return sampleBufferPromises.get(key);
	const promise = fetch(sampleData)
		.then((response) => {
			if (!response.ok) throw new Error(`Could not read the ${instrument} sample`);
			return response.arrayBuffer();
		})
		.then((data) => getAudioContext().decodeAudioData(data))
		.catch((error) => {
			sampleBufferPromises.delete(key);
			throw error;
		});
	sampleBufferPromises.set(key, promise);
	return promise;
}

function prepareInstrument(instrument) {
	audioStatus.textContent = `${instrumentSelect.selectedOptions[0].textContent} 음원 불러오는 중…`;
	if (nesWaveforms.has(instrument)) {
		getNesWaveform(instrument);
		audioStatus.textContent = `${instrumentSelect.selectedOptions[0].textContent} 음색 준비됨`;
		return;
	}
	loadSoundfont(instrument).then(() => {
		if (instrumentSelect.value === instrument) {
			audioStatus.textContent = `${instrumentSelect.selectedOptions[0].textContent} 샘플 준비됨`;
		}
	}).catch((error) => {
		console.error(error);
		if (instrumentSelect.value === instrument) {
			audioStatus.textContent = "음원 로딩 실패 · 인터넷 연결을 확인하세요";
		}
	});
}

function startNote(token, note, midi, keyElement = keyElements.get(midi), instrument = instrumentSelect.value, trackSettings = null) {
	if (activeVoices.has(token)) return;
	captureRecordingEvent("on", token, midi, instrument);
	const context = getAudioContext();
	const gain = context.createGain();
	const panner = context.createStereoPanner();
	panner.connect(masterGain);
	gain.connect(panner);
	keyElement?.classList.add("is-active");
	const voice = {
		gain,
		panner,
		source: null,
		keyElement,
		midi,
		instrument,
		trackId: trackSettings?.trackId,
		volume: trackSettings?.volume ?? 1,
		muted: trackSettings?.muted ?? false,
		pan: trackSettings?.pan ?? 0,
		baseGain: nesWaveforms.has(instrument) ? 0.28 : 0.8,
	};
	activeVoices.set(token, voice);
	panner.pan.value = voice.pan;
	if (nesWaveforms.has(instrument)) {
		const oscillator = context.createOscillator();
		oscillator.setPeriodicWave(getNesWaveform(instrument));
		oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
		const now = context.currentTime;
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, voice.muted ? 0 : voice.baseGain * voice.volume), now + 0.005);
		oscillator.connect(gain);
		voice.source = oscillator;
		oscillator.start(now);
		return;
	}
	gain.gain.value = Math.max(0.0001, voice.muted ? 0 : voice.baseGain * voice.volume);
	loadSoundfont(instrument).then((samples) => {
		const [sampleMidi, sampleData] = [...samples.entries()]
			.sort(([first], [second]) => Math.abs(first - midi) - Math.abs(second - midi))[0] ?? [];
		if (sampleMidi === undefined || !sampleData) throw new Error(`No sample found for MIDI note ${midi}`);
		return loadSampleBuffer(instrument, sampleMidi, sampleData).then((buffer) => ({ buffer, sampleMidi }));
	}).then(({ buffer, sampleMidi }) => {
		if (activeVoices.get(token) !== voice) return;
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.playbackRate.value = 2 ** ((midi - sampleMidi) / 12);
		source.connect(gain);
		voice.source = source;
		source.start();
	}).catch((error) => {
		console.error(error);
		if (activeVoices.get(token) === voice) {
			activeVoices.delete(token);
			keyElement?.classList.remove("is-active");
		}
		if (instrumentSelect.value === instrument) audioStatus.textContent = "음원 재생 실패 · 다시 시도해 주세요";
	});
}

function stopNote(token) {
	const voice = activeVoices.get(token);
	if (!voice) return;
	captureRecordingEvent("off", token, voice.midi, voice.instrument);
	activeVoices.delete(token);
	const now = audioContext.currentTime;
	voice.gain.gain.cancelScheduledValues(now);
	voice.gain.gain.setTargetAtTime(0.0001, now, 0.04);
	if (voice.source) voice.source.stop(now + 0.18);
	if (![...activeVoices.values()].some((active) => active.keyElement === voice.keyElement)) {
		voice.keyElement?.classList.remove("is-active");
	}
}

function toggleRecording() {
	if (isPlaying || isMixPlaying) return;
	if (isRecording) {
		const stopTime = performance.now() - recordingStartedAt;
		for (const token of recordingTokens) {
			const voice = activeVoices.get(token);
			if (voice) recordingEvents.push({ type: "off", token, midi: voice.midi, instrument: voice.instrument, time: stopTime });
		}
		recordingTokens.clear();
		isRecording = false;
		stopBackgroundPlayback();
		stopMetronome();
	} else {
		const backgroundRecording = backgroundRecordingEnabled.checked
			? savedRecordings.find((recording) => recording.id === backgroundRecordingSelect.value)
			: null;
		const bpm = Number(metronomeBpmInput.value);
		const beats = Number(metronomeBeatsInput.value);
		if (backgroundRecordingEnabled.checked && !backgroundRecording) {
			recordingStatus.textContent = "배경으로 재생할 녹음을 선택해 주세요.";
			return;
		}
		if (metronomeEnabled.checked &&
			(!Number.isInteger(bpm) || bpm < 20 || bpm > 300 ||
				!Number.isInteger(beats) || beats < 1 || beats > 32)) {
			recordingStatus.textContent = "BPM은 20~300, 박자는 1~32 사이로 입력해 주세요.";
			return;
		}
		recordingEvents.length = 0;
		recordingTokens.clear();
		recordingStartedAt = performance.now();
		isRecording = true;
		if (backgroundRecording) playBackgroundRecording(backgroundRecording);
		if (metronomeEnabled.checked) startMetronome(bpm, beats, Number(metronomeDenominatorSelect.value));
	}
	updateRecorder();
}

function playBackgroundRecording(recording) {
	for (const event of recording.events) {
		const timer = window.setTimeout(() => {
			const token = `background-${recording.id}-${event.token}`;
			if (event.type === "on") {
				startNote(token, { note: pitchNames[event.midi % 12] }, event.midi, undefined, event.instrument ?? instrumentSelect.value);
			} else {
				stopNote(token);
			}
		}, event.time);
		backgroundPlaybackTimers.push(timer);
	}
}

function stopBackgroundPlayback() {
	for (const timer of backgroundPlaybackTimers) window.clearTimeout(timer);
	backgroundPlaybackTimers = [];
	for (const token of activeVoices.keys()) {
		if (token.startsWith("background-")) stopNote(token);
	}
}

function scheduleMetronomeClick(context, when, accent) {
	const oscillator = context.createOscillator();
	const gain = context.createGain();
	oscillator.type = "sine";
	oscillator.frequency.value = accent ? 1320 : 880;
	gain.gain.setValueAtTime(0.0001, when);
	gain.gain.exponentialRampToValueAtTime(accent ? 0.24 : 0.15, when + 0.003);
	gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.065);
	oscillator.connect(gain);
	gain.connect(masterGain);
	oscillator.onended = () => metronomeNodes.delete(oscillator);
	metronomeNodes.add(oscillator);
	oscillator.start(when);
	oscillator.stop(when + 0.07);
}

function startMetronome(bpm, beats, denominator) {
	const context = getAudioContext();
	const beatDuration = (60 / bpm) * (4 / denominator);
	nextMetronomeBeatTime = context.currentTime + 0.05;
	metronomeBeatIndex = 0;
	const scheduleAhead = () => {
		while (nextMetronomeBeatTime < context.currentTime + 0.1) {
			scheduleMetronomeClick(context, nextMetronomeBeatTime, metronomeBeatIndex === 0);
			metronomeBeatIndex = (metronomeBeatIndex + 1) % beats;
			nextMetronomeBeatTime += beatDuration;
		}
	};
	scheduleAhead();
	metronomeSchedulerTimer = window.setInterval(scheduleAhead, 25);
}

function stopMetronome() {
	if (metronomeSchedulerTimer !== null) {
		window.clearInterval(metronomeSchedulerTimer);
		metronomeSchedulerTimer = null;
	}
	if (!audioContext) return;
	const now = audioContext.currentTime;
	for (const oscillator of metronomeNodes) {
		oscillator.stop(now);
	}
	metronomeNodes.clear();
}

function stopPlayback() {
	for (const timer of playbackTimers) window.clearTimeout(timer);
	playbackTimers.length = 0;
	for (const token of activeVoices.keys()) {
		if (token.startsWith("playback-")) stopNote(token);
	}
	isPlaying = false;
	updateRecorder();
}

function togglePlayback() {
	if (isPlaying) {
		stopPlayback();
		return;
	}
	if (isRecording || isMixPlaying || recordingEvents.length === 0) return;
	isPlaying = true;
	updateRecorder();
	for (const event of recordingEvents) {
		const timer = window.setTimeout(() => {
			const token = `playback-${event.token}`;
			if (event.type === "on") {
				startNote(token, { note: pitchNames[event.midi % 12] }, event.midi, undefined, event.instrument ?? instrumentSelect.value);
			}
			else stopNote(token);
		}, event.time);
		playbackTimers.push(timer);
	}
	const duration = Math.max(...recordingEvents.map((event) => event.time));
	playbackTimers.push(window.setTimeout(stopPlayback, duration + 250));
}

function clearRecording() {
	if (isRecording || isPlaying || isMixPlaying) return;
	recordingEvents.length = 0;
	updateRecorder();
}

function readSavedRecordings() {
	try {
		const recordings = JSON.parse(window.localStorage.getItem(recordingStorageKey) || "[]");
		return Array.isArray(recordings) ? recordings.filter((recording) =>
			typeof recording.id === "string" &&
			typeof recording.name === "string" &&
			Array.isArray(recording.events) &&
			recording.events.every((event) =>
				(event.type === "on" || event.type === "off") &&
				Number.isFinite(event.midi) &&
				Number.isFinite(event.time) &&
				(event.instrument === undefined || instrumentIds.has(event.instrument)),
			),
		) : [];
	} catch {
		return [];
	}
}

function readMixerTracks() {
	try {
		const tracks = JSON.parse(window.localStorage.getItem(mixerStorageKey) || "[]");
		return Array.isArray(tracks) ? tracks.filter((track) =>
			typeof track.id === "string" &&
			typeof track.name === "string" &&
			instrumentIds.has(track.instrument) &&
			Number.isFinite(track.volume) &&
			track.volume >= 0 &&
			track.volume <= 1 &&
			Number.isFinite(track.pan) &&
			track.pan >= -1 &&
			track.pan <= 1 &&
			typeof track.muted === "boolean" &&
			Array.isArray(track.events) &&
			track.events.length > 0 &&
			track.events.every((event) =>
				(event.type === "on" || event.type === "off") &&
				Number.isFinite(event.midi) &&
				Number.isFinite(event.time) &&
				(event.instrument === undefined || instrumentIds.has(event.instrument)),
			),
		) : [];
	} catch (error) {
		console.error("Could not read mixer tracks", error);
		return [];
	}
}

function midiForPitch(pitch) {
	const match = /^([A-G]#?)(-?\d+)$/.exec(pitch);
	if (!match) return null;
	const pitchClass = pitchNames.indexOf(match[1]);
	const midi = (Number(match[2]) + 1) * 12 + pitchClass;
	return pitchClass >= 0 && midi >= 21 && midi <= 108 ? midi : null;
}

function eventsToTimeline(events) {
	const timeline = {};
	const activeNotes = new Map();
	for (const event of events) {
		if (event.type === "on") {
			activeNotes.set(event.token, event);
			continue;
		}
		const start = activeNotes.get(event.token);
		if (!start) continue;
		activeNotes.delete(event.token);
		const time = String(Math.max(0, Math.round(start.time / 10)));
		const duration = Math.max(1, Math.round((event.time - start.time) / 10));
		(timeline[time] ??= []).push([`${pitchNames[start.midi % 12]}${Math.floor(start.midi / 12) - 1}`, duration]);
	}
	return timeline;
}

function timelineToEvents(timeline, instrument) {
	if (!timeline || typeof timeline !== "object" || Array.isArray(timeline) || !instrumentIds.has(instrument)) {
		throw new Error("녹음의 악기 또는 음표 형식이 올바르지 않습니다.");
	}
	const events = [];
	let tokenIndex = 0;
	for (const [timeKey, notesAtTime] of Object.entries(timeline)) {
		if (["_comment", "instrument", "volume", "pan", "muted"].includes(timeKey)) continue;
		const centiseconds = Number(timeKey);
		if (!Number.isSafeInteger(centiseconds) || centiseconds < 0 || !Array.isArray(notesAtTime)) {
			throw new Error("녹음의 시간 또는 음표 목록 형식이 올바르지 않습니다.");
		}
		for (const entry of notesAtTime) {
			if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" ||
				!Number.isFinite(entry[1]) || entry[1] <= 0) {
				throw new Error("녹음 음표는 [음, 길이] 형식이어야 합니다.");
			}
			const midi = midiForPitch(entry[0]);
			if (midi === null) throw new Error(`지원하지 않는 음표입니다: ${entry[0]}`);
			const token = `import-${tokenIndex++}`;
			const time = centiseconds * 10;
			events.push({ type: "on", token, midi, instrument, time });
			events.push({ type: "off", token, midi, instrument, time: time + Math.max(10, Math.round(entry[1] * 10)) });
		}
	}
	if (events.length === 0) throw new Error("JSON 파일에 불러올 음표가 없습니다.");
	return events.sort((first, second) => first.time - second.time ||
		(first.type === second.type ? 0 : first.type === "off" ? -1 : 1));
}

function recordingToJson(recording) {
	const firstNote = recording.events.find((event) => event.type === "on");
	if (!firstNote) throw new Error("내보낼 음표가 없습니다.");
	return {
		type: "recode",
		name: recording.name,
		main: {
			instrument: firstNote.instrument ?? instrumentSelect.value,
			...eventsToTimeline(recording.events),
		},
	};
}

function mixerToJson() {
	if (mixerTracks.length === 0) throw new Error("내보낼 믹서 트랙이 없습니다.");
	const main = {};
	for (const track of mixerTracks) {
		let trackName = track.name;
		let suffix = 2;
		while (Object.hasOwn(main, trackName)) trackName = `${track.name} (${suffix++})`;
		main[trackName] = {
			instrument: track.instrument,
			volume: track.volume,
			pan: track.pan,
			muted: track.muted,
			...eventsToTimeline(track.events),
		};
	}
	return { type: "mixed", name: recordingNameInput.value.trim() || "믹서", main };
}

function downloadJson(data, fallbackName) {
	const contents = JSON.stringify(data, null, 2);
	const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `${(data.name || fallbackName).replace(/[\\/:*?"<>|]/g, "_")}.json`;
	link.click();
	URL.revokeObjectURL(url);
}

function importRecordingJson(data) {
	if (isRecording || isPlaying || isMixPlaying) throw new Error("재생 또는 녹음을 멈춘 뒤 JSON을 불러와 주세요.");
	if (data.type !== "recode" || typeof data.name !== "string" ||
		!data.main || typeof data.main !== "object" || Array.isArray(data.main)) {
		throw new Error('녹음 JSON은 type이 "recode"인 형식이어야 합니다.');
	}
	const events = timelineToEvents(data.main, data.main.instrument);
	const recording = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		name: data.name.trim() || "가져온 녹음",
		createdAt: new Date().toISOString(),
		events,
	};
	savedRecordings.unshift(recording);
	try {
		window.localStorage.setItem(recordingStorageKey, JSON.stringify(savedRecordings));
	} catch (error) {
		savedRecordings.shift();
		throw new Error("녹음을 브라우저에 저장하지 못했습니다.", { cause: error });
	}
	renderSavedRecordings();
	recordingStatus.textContent = `${recording.name} JSON 불러옴`;
}

function importMixerJson(data) {
	if (isRecording || isPlaying || isMixPlaying) throw new Error("재생 또는 녹음을 멈춘 뒤 JSON을 불러와 주세요.");
	if (data.type !== "mixed" || typeof data.name !== "string" ||
		!data.main || typeof data.main !== "object" || Array.isArray(data.main)) {
		throw new Error('믹서 JSON은 type이 "mixed"인 형식이어야 합니다.');
	}
	const importedTracks = Object.entries(data.main)
		.filter(([name]) => name !== "_comment")
		.map(([name, track], index) => {
			if (!track || typeof track !== "object" || Array.isArray(track)) {
				throw new Error(`믹서 트랙 형식이 올바르지 않습니다: ${name}`);
			}
			const volume = track.volume ?? 1;
			const pan = track.pan ?? 0;
			const muted = track.muted ?? false;
			if (!Number.isFinite(volume) || volume < 0 || volume > 1 ||
				!Number.isFinite(pan) || pan < -1 || pan > 1 || typeof muted !== "boolean") {
				throw new Error(`믹서 트랙 설정이 올바르지 않습니다: ${name}`);
			}
			const events = timelineToEvents(track, track.instrument);
			return {
				id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
				name,
				instrument: track.instrument,
				volume,
				pan,
				muted,
				events,
			};
		});
	if (importedTracks.length === 0) throw new Error("JSON 파일에 불러올 믹서 트랙이 없습니다.");
	const previousTracks = mixerTracks;
	mixerTracks = [...mixerTracks, ...importedTracks];
	if (!persistMixerTracks()) {
		mixerTracks = previousTracks;
		throw new Error("믹서 트랙을 브라우저에 저장하지 못했습니다.");
	}
	renderMixerTracks();
	recordingStatus.textContent = `${importedTracks.length}개 믹서 트랙 JSON 불러옴`;
}

let pendingJsonImportType = null;
async function handleJsonFile() {
	const [file] = jsonFileInput.files;
	if (!file) return;
	try {
		const data = JSON.parse(await file.text());
		if (pendingJsonImportType === "recode") importRecordingJson(data);
		else if (pendingJsonImportType === "mixed") importMixerJson(data);
		else throw new Error("불러올 파일 유형을 확인할 수 없습니다.");
	} catch (error) {
		console.error("Could not import JSON file", error);
		recordingStatus.textContent = error instanceof SyntaxError
			? "JSON 파일을 읽을 수 없습니다. 형식을 확인해 주세요."
			: error.message || "JSON 파일을 불러오지 못했습니다.";
	} finally {
		jsonFileInput.value = "";
		pendingJsonImportType = null;
	}
}

function persistMixerTracks() {
	try {
		window.localStorage.setItem(mixerStorageKey, JSON.stringify(mixerTracks));
		return true;
	} catch (error) {
		console.error("Could not save mixer tracks", error);
		recordingStatus.textContent = "믹서 트랙을 저장하지 못했습니다.";
		return false;
	}
}

function addMixerTrack() {
	if (isRecording || isPlaying || isMixPlaying || recordingEvents.length === 0) return;
	const firstNote = recordingEvents.find((event) => event.type === "on");
	if (!firstNote) return;

	const track = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		name: recordingNameInput.value.trim() || `${instrumentSelect.selectedOptions[0].textContent} 트랙 ${mixerTracks.length + 1}`,
		instrument: firstNote.instrument ?? instrumentSelect.value,
		volume: 1,
		pan: 0,
		muted: false,
		events: recordingEvents.map((event) => ({ ...event })),
	};
	mixerTracks.push(track);
	if (!persistMixerTracks()) {
		mixerTracks.pop();
		return;
	}
	recordingNameInput.value = "";
	renderMixerTracks();
}

function updateTrackVoices(track) {
	if (!audioContext) return;
	for (const voice of activeVoices.values()) {
		if (voice.trackId !== track.id) continue;
		voice.volume = track.volume;
		voice.muted = track.muted;
		voice.pan = track.pan;
		const gain = Math.max(0.0001, voice.muted ? 0 : voice.baseGain * voice.volume);
		voice.gain.gain.setTargetAtTime(gain, audioContext.currentTime, 0.025);
		voice.panner.pan.setTargetAtTime(voice.pan, audioContext.currentTime, 0.025);
	}
}

function renderMixerTracks() {
	mixerTracksElement.replaceChildren();
	if (mixerTracks.length === 0) {
		const emptyState = document.createElement("p");
		emptyState.className = "library-empty";
		emptyState.textContent = "녹음을 믹서에 추가해 트랙을 쌓아 보세요.";
		mixerTracksElement.append(emptyState);
		updateRecorder();
		return;
	}

	for (const track of mixerTracks) {
		const row = document.createElement("article");
		row.className = "mixer-track";
		const name = document.createElement("strong");
		name.className = "mixer-track-name";
		name.textContent = track.name;
		const instrument = document.createElement("span");
		instrument.className = "mixer-track-instrument";
		instrument.textContent = track.instrument.replaceAll("-", " ");

		const volumeLabel = document.createElement("label");
		volumeLabel.className = "mixer-control";
		volumeLabel.append(document.createTextNode("음량"));
		const volume = document.createElement("input");
		volume.type = "range";
		volume.min = "0";
		volume.max = "1";
		volume.step = "0.01";
		volume.value = String(track.volume);
		volume.setAttribute("aria-label", `${track.name} 음량`);
		volumeLabel.append(volume);

		const panLabel = document.createElement("label");
		panLabel.className = "mixer-control";
		panLabel.append(document.createTextNode("좌우"));
		const pan = document.createElement("input");
		pan.type = "range";
		pan.min = "-1";
		pan.max = "1";
		pan.step = "0.01";
		pan.value = String(track.pan);
		pan.setAttribute("aria-label", `${track.name} 좌우 밸런스`);
		panLabel.append(pan);

		const muteLabel = document.createElement("label");
		muteLabel.className = "mixer-mute";
		const mute = document.createElement("input");
		mute.type = "checkbox";
		mute.checked = track.muted;
		mute.setAttribute("aria-label", `${track.name} 음소거`);
		muteLabel.append(mute, document.createTextNode("음소거"));

		const remove = document.createElement("button");
		remove.type = "button";
		remove.className = "library-action delete-recording";
		remove.textContent = "삭제";
		remove.setAttribute("aria-label", `${track.name} 믹서에서 삭제`);
		volume.addEventListener("input", () => {
			track.volume = Number(volume.value);
			updateTrackVoices(track);
			persistMixerTracks();
		});
		pan.addEventListener("input", () => {
			track.pan = Number(pan.value);
			updateTrackVoices(track);
			persistMixerTracks();
		});
		mute.addEventListener("change", () => {
			track.muted = mute.checked;
			updateTrackVoices(track);
			persistMixerTracks();
		});
		remove.addEventListener("click", () => removeMixerTrack(track.id));

		row.append(name, instrument, volumeLabel, panLabel, muteLabel, remove);
		mixerTracksElement.append(row);
	}
	updateRecorder();
}

function removeMixerTrack(trackId) {
	if (isMixPlaying) stopMixPlayback();
	const previousTracks = mixerTracks;
	mixerTracks = mixerTracks.filter((track) => track.id !== trackId);
	if (!persistMixerTracks()) {
		mixerTracks = previousTracks;
		return;
	}
	renderMixerTracks();
}

function stopMixPlayback() {
	for (const timer of mixPlaybackTimers) window.clearTimeout(timer);
	mixPlaybackTimers = [];
	for (const token of activeVoices.keys()) {
		if (token.startsWith("mix-")) stopNote(token);
	}
	isMixPlaying = false;
	updateRecorder();
}

function toggleMixPlayback() {
	if (isMixPlaying) {
		stopMixPlayback();
		return;
	}
	if (isRecording || isPlaying || mixerTracks.length === 0) return;
	isMixPlaying = true;
	updateRecorder();

	for (const track of mixerTracks) {
		for (const event of track.events) {
			const timer = window.setTimeout(() => {
				const token = `mix-${track.id}-${event.token}`;
				if (event.type === "on") {
					startNote(token, { note: pitchNames[event.midi % 12] }, event.midi, null, event.instrument ?? track.instrument, {
						trackId: track.id,
						volume: track.volume,
						pan: track.pan,
						muted: track.muted,
					});
				} else {
					stopNote(token);
				}
			}, event.time);
			mixPlaybackTimers.push(timer);
		}
	}

	const duration = Math.max(...mixerTracks.flatMap((track) => track.events.map((event) => event.time)));
	mixPlaybackTimers.push(window.setTimeout(stopMixPlayback, duration + 300));
}

function renderSavedRecordings() {
	savedRecordingsElement.replaceChildren();
	renderBackgroundRecordingOptions();
	if (savedRecordings.length === 0) {
		const emptyState = document.createElement("p");
		emptyState.className = "library-empty";
		emptyState.textContent = "저장된 녹음이 없습니다.";
		savedRecordingsElement.append(emptyState);
		return;
	}

	for (const recording of savedRecordings) {
		const row = document.createElement("article");
		row.className = "saved-recording";
		const details = document.createElement("div");
		details.className = "saved-recording-details";
		const title = document.createElement("strong");
		title.className = "saved-recording-name";
		title.textContent = recording.name;
		const meta = document.createElement("span");
		meta.className = "saved-recording-meta";
		const noteCount = recording.events.filter((event) => event.type === "on").length;
		const savedDate = new Date(recording.createdAt);
		meta.textContent = `${noteCount}개 음 · ${Number.isNaN(savedDate.getTime()) ? "저장된 녹음" : savedDate.toLocaleString("ko-KR")}`;
		details.append(title, meta);

		const actions = document.createElement("div");
		actions.className = "saved-recording-actions";
		const loadButton = document.createElement("button");
		loadButton.type = "button";
		loadButton.className = "library-action";
		loadButton.textContent = "불러오기";
		loadButton.addEventListener("click", () => loadSavedRecording(recording));
		const deleteButton = document.createElement("button");
		deleteButton.type = "button";
		deleteButton.className = "library-action delete-recording";
		deleteButton.textContent = "삭제";
		deleteButton.setAttribute("aria-label", `${recording.name} 삭제`);
		deleteButton.addEventListener("click", () => deleteSavedRecording(recording.id));
		actions.append(loadButton, deleteButton);
		row.append(details, actions);
		savedRecordingsElement.append(row);
	}
}

function renderBackgroundRecordingOptions() {
	const selectedId = backgroundRecordingSelect.value;
	backgroundRecordingSelect.replaceChildren();
	const placeholder = document.createElement("option");
	placeholder.value = "";
	placeholder.textContent = savedRecordings.length ? "저장된 녹음 선택" : "저장된 녹음 없음";
	backgroundRecordingSelect.append(placeholder);
	for (const recording of savedRecordings) {
		const option = document.createElement("option");
		option.value = recording.id;
		option.textContent = recording.name;
		backgroundRecordingSelect.append(option);
	}
	if (savedRecordings.some((recording) => recording.id === selectedId)) {
		backgroundRecordingSelect.value = selectedId;
	} else if (savedRecordings.length === 1) {
		backgroundRecordingSelect.value = savedRecordings[0].id;
	}
	if (savedRecordings.length === 0) backgroundRecordingEnabled.checked = false;
	updateRecorder();
}

function saveCurrentRecording() {
	if (isRecording || isPlaying || isMixPlaying || recordingEvents.length === 0) return;
	const name = recordingNameInput.value.trim() || `녹음 ${new Date().toLocaleString("ko-KR")}`;
	const recording = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		name,
		createdAt: new Date().toISOString(),
		events: recordingEvents.map((event) => ({ ...event })),
	};
	savedRecordings.unshift(recording);
	try {
		window.localStorage.setItem(recordingStorageKey, JSON.stringify(savedRecordings));
	} catch {
		savedRecordings.shift();
		recordingStatus.textContent = "브라우저 저장 공간을 사용할 수 없습니다.";
		return;
	}
	loadedRecordingId = recording.id;
	recordingNameInput.value = "";
	recordingStatus.textContent = "사이트에 저장됨";
	renderSavedRecordings();
	updateRecorder();
}

function loadSavedRecording(recording) {
	if (isRecording || isPlaying || isMixPlaying) return;
	recordingEvents.splice(0, recordingEvents.length, ...recording.events.map((event) => ({ ...event })));
	loadedRecordingId = recording.id;
	recordingStatus.textContent = `${recording.name} 불러옴`;
	updateRecorder();
}

function deleteSavedRecording(recordingId) {
	const previousRecordings = savedRecordings;
	savedRecordings = savedRecordings.filter((recording) => recording.id !== recordingId);
	try {
		window.localStorage.setItem(recordingStorageKey, JSON.stringify(savedRecordings));
	} catch {
		savedRecordings = previousRecordings;
		recordingStatus.textContent = "녹음을 삭제하지 못했습니다.";
		return;
	}
	if (loadedRecordingId === recordingId) {
		recordingEvents.length = 0;
		loadedRecordingId = null;
		updateRecorder();
	}
	renderSavedRecordings();
}

window.addEventListener("keydown", (event) => {
	const target = event.target;
	const isTextInput = target instanceof HTMLElement &&
		(target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
	const octaveKey = /^(?:Digit|Numpad)([1-7])$/.exec(event.code);
	if (octaveKey && !event.ctrlKey && !event.altKey && !event.metaKey && !isTextInput) {
		event.preventDefault();
		baseOctave = Number(octaveKey[1]);
		updateOctave();
		return;
	}

	const note = notes.find((entry) => entry.code === event.code);
	const isCtrlNote = event.ctrlKey && note;
	if (isCtrlNote) {
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	if (["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight"].includes(event.code)) {
		heldCodes.add(event.code);
		updateOctave();
		return;
	}

	if (!note || event.repeat) return;
	event.preventDefault();
	heldCodes.add(event.code);
	const midi = (currentOctave() + 1) * 12 + notes.indexOf(note);
	startNote(`keyboard-${event.code}`, note, midi);
}, true);

document.addEventListener("keyup", (event) => {
	heldCodes.delete(event.code);
	if (["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight"].includes(event.code)) updateOctave();
	if (notes.some((note) => note.code === event.code)) stopNote(`keyboard-${event.code}`);
});

window.addEventListener("blur", () => {
	for (const token of activeVoices.keys()) stopNote(token);
	heldCodes.clear();
	updateOctave();
});

document.querySelector("#octave-down").addEventListener("click", () => {
	baseOctave = Math.max(1, baseOctave - 1);
	updateOctave();
});

document.querySelector("#octave-up").addEventListener("click", () => {
	baseOctave = Math.min(7, baseOctave + 1);
	updateOctave();
});

recordButton.addEventListener("click", toggleRecording);
playButton.addEventListener("click", togglePlayback);
clearButton.addEventListener("click", clearRecording);
saveRecordingButton.addEventListener("click", saveCurrentRecording);
exportRecordingButton.addEventListener("click", () => {
	try {
		const name = recordingNameInput.value.trim() || `녹음 ${new Date().toLocaleString("ko-KR")}`;
		downloadJson(recordingToJson({ name, events: recordingEvents }), name);
	} catch (error) {
		recordingStatus.textContent = error.message || "녹음 JSON을 저장하지 못했습니다.";
	}
});
exportMixButton.addEventListener("click", () => {
	try {
		downloadJson(mixerToJson(), "믹서");
	} catch (error) {
		recordingStatus.textContent = error.message || "믹서 JSON을 저장하지 못했습니다.";
	}
});
importRecordingButton.addEventListener("click", () => {
	pendingJsonImportType = "recode";
	jsonFileInput.click();
});
importMixButton.addEventListener("click", () => {
	pendingJsonImportType = "mixed";
	jsonFileInput.click();
});
jsonFileInput.addEventListener("change", handleJsonFile);
addTrackButton.addEventListener("click", addMixerTrack);
backgroundRecordingEnabled.addEventListener("change", updateRecorder);
backgroundRecordingSelect.addEventListener("change", updateRecorder);
metronomeEnabled.addEventListener("change", updateRecorder);
playMixButton.addEventListener("click", toggleMixPlayback);
clearMixButton.addEventListener("click", () => {
	if (isMixPlaying) return;
	const previousTracks = mixerTracks;
	mixerTracks = [];
	if (!persistMixerTracks()) mixerTracks = previousTracks;
	renderMixerTracks();
});

savedRecordings = readSavedRecordings();
renderSavedRecordings();
mixerTracks = readMixerTracks();
renderMixerTracks();
instrumentSelect.addEventListener("change", () => {
	instrumentLabel.textContent = instrumentSelect.selectedOptions[0].textContent;
	prepareInstrument(instrumentSelect.value);
});
siteVolume.addEventListener("input", updateSiteVolume);
updateSiteVolume();
instrumentLabel.textContent = instrumentSelect.selectedOptions[0].textContent;
prepareInstrument(instrumentSelect.value);
updateOctave();
updateRecorder();
