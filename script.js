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
const savedRecordingsElement = document.querySelector("#saved-recordings");
const instrumentSelect = document.querySelector("#instrument-select");
const instrumentLabel = document.querySelector("#instrument-label");
const instrumentHint = document.querySelector("#instrument-hint");
const fluteControl = document.querySelector("#flute-control");
const fluteStatus = document.querySelector("#flute-fingering-status");
const fluteHoleButtons = [...document.querySelectorAll(".flute-hole")];
const fluteReferenceElement = document.querySelector("#flute-reference-registers");
const tromboneControl = document.querySelector("#trombone-control");
const tromboneSlide = document.querySelector("#trombone-slide");
const tromboneNote = document.querySelector("#trombone-note");
const addTrackButton = document.querySelector("#add-mixer-track");
const mixerTracksElement = document.querySelector("#mixer-tracks");
const playMixButton = document.querySelector("#play-mix");
const mixPlayLabel = document.querySelector("#mix-play-label");
const clearMixButton = document.querySelector("#clear-mix");
const heldCodes = new Set();
const activeVoices = new Map();
const keyElements = new Map();
const fingeredNotes = new Map();
const fluteFingerKeys = new Set();
const flutePointerKeys = new Set();
const pitchNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const recordingEvents = [];
const recordingTokens = new Set();
const playbackTimers = [];
const recordingStorageKey = "key-piano-recordings-v1";
const mixerStorageKey = "key-piano-mixer-v1";
const instrumentNames = {
	piano: "피아노",
	electric: "일렉트릭 피아노",
	organ: "오르간",
	ocarina: "오카리나",
	flute: "플루트",
	trombone: "트롬본",
};
let savedRecordings = [];
let mixerTracks = [];
let loadedRecordingId = null;
let baseOctave = 4;
let audioContext;
let recordingStartedAt = 0;
let isRecording = false;
let isPlaying = false;
let isMixPlaying = false;
let currentBreathMidi = null;
let currentFluteMidi = null;
let trombonePointerDown = false;
let trackPlaybackTimers = [];

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
		handleNotePress(`pointer-${event.pointerId}`, note, midi, button);
	});
	button.addEventListener("pointerup", (event) => handleNoteRelease(`pointer-${event.pointerId}`));
	button.addEventListener("pointercancel", (event) => handleNoteRelease(`pointer-${event.pointerId}`));
	button.addEventListener("lostpointercapture", (event) => handleNoteRelease(`pointer-${event.pointerId}`));
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
	if (isFluteInstrumentMode()) return heldCodes.has("ControlLeft") ? 1 : 0;
	if (heldCodes.has("ControlLeft") && heldCodes.has("ShiftLeft")) return 2;
	if (heldCodes.has("ControlLeft")) return 1;
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
	updateFluteFingering();
}

function selectedMode() {
	return document.querySelector('input[name="play-mode"]:checked').value;
}

function selectedInstrument() {
	return instrumentSelect.value;
}

function isFluteInstrumentMode() {
	return selectedMode() === "instrument" && selectedInstrument() === "flute";
}

const fluteFingerings = new Map([
	{ register: "low", keys: ["KeyA", "KeyD", "KeyF", "KeyH", "KeyJ", "KeyK", "KeyL", "KeyS", "KeyX", "Period", "Semicolon"], note: "B", semitone: -1 },
	{ register: "low", keys: ["KeyA", "KeyD", "KeyF", "KeyH", "KeyJ", "KeyK", "KeyL", "KeyS", "KeyX", "Semicolon"], note: "C", semitone: 0 },
	{ register: "low", keys: ["KeyA", "KeyD", "KeyF", "KeyH", "KeyJ", "KeyK", "KeyL", "KeyS", "KeyX"], note: "C#/Db", semitone: 1 },
	{ register: "low", keys: ["KeyD", "KeyH", "KeyJ", "KeyK", "KeyS", "KeyX"], note: "D", semitone: 2 },
	{ register: "low", keys: ["KeyD", "KeyH", "KeyJ", "KeyK", "KeyL", "KeyS", "KeyX"], note: "D#/Eb", semitone: 3 },
	{ register: "low", keys: ["KeyA", "Period"], note: "E", semitone: 4 },
	{ register: "low", keys: ["KeyA", "KeyD", "KeyF", "KeyH", "KeyJ", "KeyK", "KeyS"], note: "F", semitone: 5 },
	{ register: "low", keys: ["KeyA", "KeyD", "KeyF", "KeyH", "KeyJ", "KeyS"], note: "F#/Gb", semitone: 6 },
	{ register: "low", keys: ["KeyA", "KeyD", "KeyS"], note: "G", semitone: 7 },
	{ register: "low", keys: ["KeyA", "KeyD", "KeyL", "KeyS"], note: "G#/Ab", semitone: 8 },
	{ register: "low", keys: ["KeyA", "KeyS"], note: "A", semitone: 9 },
	{ register: "low", keys: ["KeyA"], note: "A#/Bb", semitone: 10 },
	{ register: "high", keys: ["KeyA", "KeyX"], note: "B", semitone: -1 },
	{ register: "high", keys: ["KeyA"], note: "C", semitone: 0 },
	{ register: "high", keys: ["KeyX"], note: "C#/Db", semitone: 1 },
	{ register: "high", keys: ["KeyD", "KeyH", "KeyJ", "KeyK", "KeyS"], note: "D", semitone: 2 },
	{ register: "high", keys: ["KeyD", "KeyH", "KeyJ", "KeyK", "KeyL", "KeyS"], note: "D#/Eb", semitone: 3 },
	{ register: "high", keys: ["KeyA", "KeyD", "KeyH", "KeyJ", "KeyS"], note: "E", semitone: 4 },
	{ register: "high", keys: ["KeyA", "KeyD", "KeyH", "KeyS"], note: "F", semitone: 5 },
	{ register: "high", keys: ["KeyA", "KeyD", "KeyS"], note: "F#/Gb", semitone: 6 },
	{ register: "high", keys: ["KeyA", "KeyS"], note: "G", semitone: 7 },
	{ register: "high", keys: ["KeyA", "KeyL"], note: "G#/Ab", semitone: 8 },
	{ register: "high", keys: ["KeyA", "KeyJ"], note: "A", semitone: 9 },
	{ register: "high", keys: ["KeyS"], note: "A#/Bb", semitone: 10 },
].map((fingering) => [`${fingering.register}:${fingering.keys.sort().join(",")}`, fingering]));

function activeFluteKeys() {
	return new Set([...fluteFingerKeys, ...flutePointerKeys]);
}

function updateFluteFingering() {
	const activeKeys = activeFluteKeys();
	for (const button of fluteHoleButtons) {
		button.classList.toggle("is-pressed", activeKeys.has(button.dataset.fluteKey));
	}
	if (!isFluteInstrumentMode()) return;

	const register = heldCodes.has("ControlLeft") ? "high" : "low";
	const fingering = fluteFingerings.get(`${register}:${[...activeKeys].sort().join(",")}`);
	if (!fingering) {
		fluteStatus.textContent = activeKeys.size ? "표에 없는 운지입니다. 검은 구멍 조합을 확인하세요." : "검은 구멍에 해당하는 키를 누른 뒤 Space를 불어주세요. Ctrl은 높은 음역입니다.";
		if (heldCodes.has("Space") && currentFluteMidi !== null) stopFluteBreath();
		return;
	}

	const octave = currentOctave() + (fingering.semitone < 0 ? -1 : 0);
	fluteStatus.textContent = `${fingering.note}${octave} · ${register === "low" ? "낮은 음역" : "높은 음역"}${heldCodes.has("Space") ? " · 숨을 불고 있습니다" : " · Space를 눌러 연주"}`;
	const midi = (currentOctave() + 1) * 12 + fingering.semitone;
	if (heldCodes.has("Space")) startFluteBreath(midi);
}

function startFluteBreath(midi) {
	if (currentFluteMidi === midi) return;
	if (currentFluteMidi !== null) stopNote("flute-breath");
	currentFluteMidi = midi;
	startNote("flute-breath", { note: pitchNames[midi % 12] }, midi, undefined, { instrument: "flute" });
}

function stopFluteBreath() {
	if (currentFluteMidi === null) return;
	stopNote("flute-breath");
	currentFluteMidi = null;
}

function updateInstrumentControls() {
	const instrument = selectedInstrument();
	const instrumentMode = selectedMode() === "instrument";
	instrumentLabel.textContent = instrument.toUpperCase();
	fluteControl.hidden = !(instrumentMode && instrument === "flute");
	keyboard.hidden = instrumentMode && instrument === "flute";
	tromboneControl.hidden = !(instrumentMode && instrument === "trombone");
	if (!instrumentMode) {
		instrumentHint.textContent = "건반을 눌러 선택한 악기의 음색으로 연주하세요.";
	} else if (instrument === "ocarina") {
		instrumentHint.textContent = "음 키를 누른 채 스페이스를 눌러 숨을 불어 연주하세요.";
	} else if (instrument === "flute") {
		instrumentHint.textContent = "표의 운지 키 조합 후 Space로 숨을 불고, Ctrl을 눌러 높은 음역을 선택하세요.";
	} else if (instrument === "trombone") {
		instrumentHint.textContent = "슬라이더를 마우스로 누른 채 움직여 음을 이어 연주하세요.";
	} else {
		instrumentHint.textContent = "건반을 눌러 실제 악기 음색으로 연주하세요.";
	}
	updateFluteFingering();
}

function renderFluteReference() {
	fluteReferenceElement.replaceChildren();
	for (const [register, title] of [["low", "낮은 음역 · B3–Bb4"], ["high", "높은 음역 · B4–Bb5 (Ctrl)"]]) {
		const group = document.createElement("section");
		group.className = "flute-reference-group";
		const heading = document.createElement("strong");
		heading.textContent = title;
		const list = document.createElement("div");
		list.className = "flute-reference-list";
		for (const [, fingering] of fluteFingerings) {
			if (fingering.register !== register) continue;
			const row = document.createElement("div");
			row.className = "flute-reference-row";
			const note = document.createElement("strong");
			note.textContent = fingering.note;
			const keys = document.createElement("span");
			keys.textContent = fingering.keys.map((code) =>
				fluteHoleButtons.find((button) => button.dataset.fluteKey === code)?.textContent ?? code,
			).join(" + ");
			row.append(note, keys);
			list.append(row);
		}
		group.append(heading, list);
		fluteReferenceElement.append(group);
	}
}

function updateRecorder() {
	recordButton.classList.toggle("is-recording", isRecording);
	recordLabel.textContent = isRecording ? "녹음 중지" : "녹음";
	playLabel.textContent = isPlaying ? "정지" : "재생";
	recordButton.disabled = isPlaying || isMixPlaying;
	playButton.disabled = isRecording || isMixPlaying || recordingEvents.length === 0;
	clearButton.disabled = isRecording || isPlaying || isMixPlaying || recordingEvents.length === 0;
	saveRecordingButton.disabled = isRecording || isPlaying || isMixPlaying || recordingEvents.length === 0;
	addTrackButton.disabled = isRecording || isPlaying || isMixPlaying || recordingEvents.length === 0;
	const noteCount = recordingEvents.filter((event) => event.type === "on").length;
	recordingStatus.textContent = isRecording ? "REC · 녹음 중" : isMixPlaying ? "MIX · 재생 중" : noteCount ? `${noteCount}개 음 녹음됨` : "녹음 없음";
	playMixButton.disabled = mixerTracks.length === 0 || isRecording || isPlaying;
	clearMixButton.disabled = mixerTracks.length === 0 || isMixPlaying;
	mixPlayLabel.textContent = isMixPlaying ? "믹스 정지" : "믹스 재생";
}

function captureRecordingEvent(type, token, midi) {
	if (!isRecording) return;
	if (type === "off" && !recordingTokens.has(token)) return;
	if (type === "on") recordingTokens.add(token);
	else recordingTokens.delete(token);
	recordingEvents.push({
		type,
		token,
		midi,
		time: performance.now() - recordingStartedAt,
		instrument: selectedInstrument(),
		velocity: 1,
	});
}

function startNote(token, note, midi, keyElement = keyElements.get(midi), options = {}) {
	if (activeVoices.has(token)) return;
	captureRecordingEvent("on", token, midi);
	const frequency = 440 * 2 ** ((midi - 69) / 12);
	const context = audioContext ??= new AudioContext();
	if (context.state === "suspended") context.resume();

	const gain = context.createGain();
	const panner = context.createStereoPanner();
	const fundamental = context.createOscillator();
	const overtone = context.createOscillator();
	const now = context.currentTime;
	const instrument = options.instrument ?? selectedInstrument();
	const waveforms = {
		piano: ["triangle", "sine"],
		electric: ["sine", "square"],
		organ: ["square", "sine"],
		ocarina: ["sine", "triangle"],
		flute: ["sine", "sine"],
		trombone: ["sawtooth", "triangle"],
	};
	const [fundamentalWave, overtoneWave] = waveforms[instrument] ?? waveforms.piano;
	fundamental.type = fundamentalWave;
	overtone.type = overtoneWave;
	fundamental.frequency.value = frequency;
	overtone.frequency.value = frequency * 2.002;
	const track = mixerTracks.find((entry) => entry.id === options.trackId);
	const volume = options.volume ?? track?.volume ?? 1;
	const velocity = options.velocity ?? 1;
	const muted = options.muted ?? track?.muted ?? false;
	const pan = options.pan ?? track?.pan ?? 0;
	const baseGain = instrument === "organ" ? 0.08 : 0.13;
	const outputGain = baseGain * volume * velocity * (muted ? 0 : 1);
	panner.pan.value = pan;
	gain.gain.setValueAtTime(0.0001, now);
	gain.gain.exponentialRampToValueAtTime(muted ? 0.0001 : outputGain * 1.7, now + 0.025);
	gain.gain.exponentialRampToValueAtTime(muted ? 0.0001 : outputGain, now + 0.18);
	fundamental.connect(gain);
	overtone.connect(gain);
	gain.connect(panner);
	panner.connect(context.destination);
	fundamental.start(now);
	overtone.start(now);

	keyElement?.classList.add("is-active");
	activeVoices.set(token, { gain, panner, fundamental, overtone, keyElement, midi, baseGain, volume, velocity, instrument, trackId: options.trackId });
}

function handleNotePress(token, note, midi, keyElement) {
	if (selectedMode() === "instrument" && selectedInstrument() === "ocarina") {
		fingeredNotes.set(token, { note, midi, keyElement });
		keyElement?.classList.add("is-active");
		if (heldCodes.has("Space")) startOcarinaBreath();
		return;
	}
	if (selectedMode() === "instrument" && selectedInstrument() === "trombone") return;
	startNote(token, note, midi, keyElement);
}

function handleNoteRelease(token) {
	const finger = fingeredNotes.get(token);
	if (finger) {
		fingeredNotes.delete(token);
		if (finger.midi === currentBreathMidi) {
			stopNote("ocarina-breath");
			currentBreathMidi = null;
		}
		if (![...fingeredNotes.values()].some((entry) => entry.keyElement === finger.keyElement)) {
			finger.keyElement?.classList.remove("is-active");
		}
		return;
	}
	stopNote(token);
}

function startOcarinaBreath() {
	const finger = [...fingeredNotes.values()].at(-1);
	if (!finger) {
		instrumentHint.textContent = "먼저 도·레·미 등의 음 키를 누른 뒤 스페이스를 누르세요.";
		return;
	}
	if (currentBreathMidi === finger.midi) return;
	if (currentBreathMidi !== null) stopNote("ocarina-breath");
	currentBreathMidi = finger.midi;
	startNote("ocarina-breath", finger.note, finger.midi, finger.keyElement, { instrument: "ocarina" });
}

function setTrombonePitch(midi) {
	const voice = activeVoices.get("trombone-slide");
	if (!voice) return;
	voice.midi = midi;
	const frequency = 440 * 2 ** ((midi - 69) / 12);
	voice.fundamental.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.035);
	voice.overtone.frequency.setTargetAtTime(frequency * 2.002, audioContext.currentTime, 0.035);
	tromboneNote.textContent = `${pitchNames[midi % 12]}${Math.floor(midi / 12) - 1}`;
	if (isRecording) {
		recordingEvents.push({ type: "pitch", token: "trombone-slide", midi, time: performance.now() - recordingStartedAt });
	}
}

function stopNote(token) {
	const voice = activeVoices.get(token);
	if (!voice) return;
	captureRecordingEvent("off", token, voice.midi);
	activeVoices.delete(token);
	const now = audioContext.currentTime;
	voice.gain.gain.cancelScheduledValues(now);
	voice.gain.gain.setTargetAtTime(0.0001, now, 0.045);
	voice.fundamental.stop(now + 0.2);
	voice.overtone.stop(now + 0.2);
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
			if (voice) recordingEvents.push({ type: "off", token, midi: voice.midi, time: stopTime });
		}
		recordingTokens.clear();
		isRecording = false;
	} else {
		recordingEvents.length = 0;
		recordingTokens.clear();
		recordingStartedAt = performance.now();
		isRecording = true;
	}
	updateRecorder();
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
				startNote(token, { note: pitchNames[event.midi % 12] }, event.midi, undefined, {
					instrument: event.instrument ?? selectedInstrument(),
					velocity: event.velocity ?? 1,
				});
			} else if (event.type === "pitch") {
				const voice = activeVoices.get(token);
				if (voice) {
					voice.midi = event.midi;
					const frequency = 440 * 2 ** ((event.midi - 69) / 12);
					voice.fundamental.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.035);
					voice.overtone.frequency.setTargetAtTime(frequency * 2.002, audioContext.currentTime, 0.035);
				}
			} else stopNote(token);
		}, event.time);
		playbackTimers.push(timer);
	}
	const duration = Math.max(...recordingEvents.map((event) => event.time));
	playbackTimers.push(window.setTimeout(stopPlayback, duration + 250));
}

function clearRecording() {
	if (isRecording || isPlaying) return;
	recordingEvents.length = 0;
	loadedRecordingId = null;
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
				(event.type === "on" || event.type === "off" || event.type === "pitch") &&
				Number.isFinite(event.midi) &&
				Number.isFinite(event.time) &&
				(event.instrument === undefined || Object.hasOwn(instrumentNames, event.instrument)) &&
				(event.velocity === undefined || Number.isFinite(event.velocity)),
			),
		) : [];
	} catch {
		return [];
	}
}

function persistMixerTracks() {
	try {
		window.localStorage.setItem(mixerStorageKey, JSON.stringify(mixerTracks));
		return true;
	} catch {
		recordingStatus.textContent = "믹서 트랙을 브라우저에 저장하지 못했습니다.";
		return false;
	}
}

function readMixerTracks() {
	try {
		const tracks = JSON.parse(window.localStorage.getItem(mixerStorageKey) || "[]");
		return Array.isArray(tracks) ? tracks.filter((track) =>
			typeof track.id === "string" &&
			typeof track.name === "string" &&
			Object.hasOwn(instrumentNames, track.instrument) &&
			Number.isFinite(track.volume) &&
			Number.isFinite(track.pan) &&
			typeof track.muted === "boolean" &&
			Array.isArray(track.events) &&
			track.events.length > 0 &&
			track.events.every((event) =>
				["on", "off", "pitch"].includes(event.type) &&
				Number.isFinite(event.midi) &&
				Number.isFinite(event.time),
			),
		) : [];
	} catch {
		return [];
	}
}

function addMixerTrack() {
	if (isRecording || isPlaying || recordingEvents.length === 0) return;
	const track = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		name: recordingNameInput.value.trim() || `${instrumentNames[selectedInstrument()]} 트랙 ${mixerTracks.length + 1}`,
		instrument: recordingEvents.find((event) => event.type === "on")?.instrument ?? selectedInstrument(),
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

function updateTrackVoiceSettings(track) {
	for (const voice of activeVoices.values()) {
		if (voice.trackId !== track.id) continue;
		const value = voice.baseGain * voice.velocity * track.volume * (track.muted ? 0 : 1);
		voice.gain.gain.setTargetAtTime(Math.max(0.0001, value), audioContext.currentTime, 0.025);
		voice.panner.pan.setTargetAtTime(track.pan, audioContext.currentTime, 0.025);
	}
}

function renderMixerTracks() {
	mixerTracksElement.replaceChildren();
	playMixButton.disabled = mixerTracks.length === 0 || isPlaying || isRecording;
	clearMixButton.disabled = mixerTracks.length === 0 || isMixPlaying;
	mixPlayLabel.textContent = isMixPlaying ? "믹스 정지" : "믹스 재생";
	if (mixerTracks.length === 0) {
		const emptyState = document.createElement("p");
		emptyState.className = "library-empty";
		emptyState.textContent = "녹음을 믹서에 추가해 트랙을 쌓아 보세요.";
		mixerTracksElement.append(emptyState);
		return;
	}
	for (const track of mixerTracks) {
		const row = document.createElement("article");
		row.className = "mixer-track";
		const title = document.createElement("strong");
		title.className = "mixer-track-name";
		title.textContent = track.name;
		const instrument = document.createElement("span");
		instrument.className = "mixer-track-instrument";
		instrument.textContent = instrumentNames[track.instrument];
		const volumeLabel = document.createElement("label");
		volumeLabel.className = "mixer-control";
		volumeLabel.textContent = "음량";
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
		panLabel.textContent = "좌우";
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
			updateTrackVoiceSettings(track);
			persistMixerTracks();
		});
		pan.addEventListener("input", () => {
			track.pan = Number(pan.value);
			updateTrackVoiceSettings(track);
			persistMixerTracks();
		});
		mute.addEventListener("change", () => {
			track.muted = mute.checked;
			updateTrackVoiceSettings(track);
			persistMixerTracks();
		});
		remove.addEventListener("click", () => removeMixerTrack(track.id));
		row.append(title, instrument, volumeLabel, panLabel, muteLabel, remove);
		mixerTracksElement.append(row);
	}
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
	for (const timer of trackPlaybackTimers) window.clearTimeout(timer);
	trackPlaybackTimers = [];
	for (const token of activeVoices.keys()) {
		if (token.startsWith("mix-")) stopNote(token);
	}
	isMixPlaying = false;
	renderMixerTracks();
	updateRecorder();
}

function toggleMixPlayback() {
	if (isMixPlaying) {
		stopMixPlayback();
		return;
	}
	if (isRecording || isPlaying || mixerTracks.length === 0) return;
	isMixPlaying = true;
	renderMixerTracks();
	updateRecorder();
	for (const track of mixerTracks) {
		for (const event of track.events) {
			const timer = window.setTimeout(() => {
				const token = `mix-${track.id}-${event.token ?? "slide"}`;
				if (event.type === "on") {
					startNote(token, { note: pitchNames[event.midi % 12] }, event.midi, undefined, {
						instrument: event.instrument ?? track.instrument,
						velocity: event.velocity ?? 1,
						trackId: track.id,
					});
				} else if (event.type === "pitch") {
					const voice = activeVoices.get(token);
					if (voice) {
						voice.midi = event.midi;
						const frequency = 440 * 2 ** ((event.midi - 69) / 12);
						voice.fundamental.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.035);
						voice.overtone.frequency.setTargetAtTime(frequency * 2.002, audioContext.currentTime, 0.035);
					}
				} else stopNote(token);
			}, event.time);
			trackPlaybackTimers.push(timer);
		}
	}
	const duration = Math.max(...mixerTracks.flatMap((track) => track.events.map((event) => event.time)));
	trackPlaybackTimers.push(window.setTimeout(stopMixPlayback, duration + 300));
}

function renderSavedRecordings() {
	savedRecordingsElement.replaceChildren();
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

function saveCurrentRecording() {
	if (isRecording || isPlaying || recordingEvents.length === 0) return;
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
	if (isRecording || isPlaying) return;
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

document.addEventListener("keydown", (event) => {
	if (event.ctrlKey && event.code === "KeyS") event.preventDefault();
}, true);

document.addEventListener("keydown", (event) => {
	if (["ControlLeft", "ShiftLeft", "ShiftRight"].includes(event.code)) {
		heldCodes.add(event.code);
		updateOctave();
		return;
	}
	if (event.code === "Space" && selectedMode() === "instrument" && ["ocarina", "flute"].includes(selectedInstrument())) {
		event.preventDefault();
		heldCodes.add("Space");
		if (selectedInstrument() === "ocarina") startOcarinaBreath();
		else updateFluteFingering();
		return;
	}
	if (isFluteInstrumentMode() && fluteHoleButtons.some((button) => button.dataset.fluteKey === event.code)) {
		event.preventDefault();
		fluteFingerKeys.add(event.code);
		updateFluteFingering();
		return;
	}

	const note = notes.find((entry) => entry.code === event.code);
	if (!note || event.repeat) return;
	event.preventDefault();
	heldCodes.add(event.code);
	const midi = (currentOctave() + 1) * 12 + notes.indexOf(note);
	handleNotePress(`keyboard-${event.code}`, note, midi);
});

document.addEventListener("keyup", (event) => {
	heldCodes.delete(event.code);
	if (["ControlLeft", "ShiftLeft", "ShiftRight"].includes(event.code)) updateOctave();
	if (isFluteInstrumentMode() && fluteHoleButtons.some((button) => button.dataset.fluteKey === event.code)) {
		fluteFingerKeys.delete(event.code);
		updateFluteFingering();
		return;
	}
	if (event.code === "Space" && currentBreathMidi !== null) {
		stopNote("ocarina-breath");
		currentBreathMidi = null;
	}
	if (event.code === "Space" && currentFluteMidi !== null) {
		stopFluteBreath();
		updateFluteFingering();
	}
	if (notes.some((note) => note.code === event.code)) handleNoteRelease(`keyboard-${event.code}`);
});

window.addEventListener("blur", () => {
	for (const token of activeVoices.keys()) stopNote(token);
	for (const finger of fingeredNotes.values()) finger.keyElement?.classList.remove("is-active");
	heldCodes.clear();
	fingeredNotes.clear();
	fluteFingerKeys.clear();
	flutePointerKeys.clear();
	currentBreathMidi = null;
	currentFluteMidi = null;
	trombonePointerDown = false;
	updateOctave();
	updateFluteFingering();
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
addTrackButton.addEventListener("click", addMixerTrack);
playMixButton.addEventListener("click", toggleMixPlayback);
clearMixButton.addEventListener("click", () => {
	if (isMixPlaying) return;
	const previousTracks = mixerTracks;
	mixerTracks = [];
	if (!persistMixerTracks()) mixerTracks = previousTracks;
	renderMixerTracks();
});

instrumentSelect.addEventListener("change", () => {
	for (const token of activeVoices.keys()) stopNote(token);
	for (const finger of fingeredNotes.values()) finger.keyElement?.classList.remove("is-active");
	fingeredNotes.clear();
	currentBreathMidi = null;
	currentFluteMidi = null;
	fluteFingerKeys.clear();
	flutePointerKeys.clear();
	updateInstrumentControls();
});
document.querySelectorAll('input[name="play-mode"]').forEach((input) => {
	input.addEventListener("change", () => {
		for (const token of activeVoices.keys()) stopNote(token);
		for (const finger of fingeredNotes.values()) finger.keyElement?.classList.remove("is-active");
		fingeredNotes.clear();
		currentBreathMidi = null;
		currentFluteMidi = null;
		fluteFingerKeys.clear();
		flutePointerKeys.clear();
		updateInstrumentControls();
	});
});

for (const button of fluteHoleButtons) {
	button.addEventListener("pointerdown", (event) => {
		event.preventDefault();
		button.setPointerCapture(event.pointerId);
		flutePointerKeys.add(button.dataset.fluteKey);
		updateFluteFingering();
	});
	const releasePointerKey = () => {
		flutePointerKeys.delete(button.dataset.fluteKey);
		updateFluteFingering();
	};
	button.addEventListener("pointerup", releasePointerKey);
	button.addEventListener("pointercancel", releasePointerKey);
	button.addEventListener("lostpointercapture", releasePointerKey);
}

tromboneSlide.addEventListener("pointerdown", (event) => {
	trombonePointerDown = true;
	tromboneSlide.setPointerCapture(event.pointerId);
	const midi = Number(tromboneSlide.value);
	startNote("trombone-slide", { note: pitchNames[midi % 12] }, midi, undefined, { instrument: "trombone" });
	tromboneNote.textContent = `${pitchNames[midi % 12]}${Math.floor(midi / 12) - 1}`;
});
tromboneSlide.addEventListener("input", () => {
	if (trombonePointerDown) setTrombonePitch(Number(tromboneSlide.value));
});
function stopTromboneSlide() {
	if (!trombonePointerDown) return;
	trombonePointerDown = false;
	stopNote("trombone-slide");
}
tromboneSlide.addEventListener("pointerup", stopTromboneSlide);
tromboneSlide.addEventListener("pointercancel", stopTromboneSlide);
tromboneSlide.addEventListener("lostpointercapture", stopTromboneSlide);

savedRecordings = readSavedRecordings();
renderSavedRecordings();
mixerTracks = readMixerTracks();
renderMixerTracks();
renderFluteReference();
updateOctave();
updateInstrumentControls();
updateRecorder();
