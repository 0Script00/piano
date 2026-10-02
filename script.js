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
const heldCodes = new Set();
const activeVoices = new Map();
const keyElements = new Map();
const pitchNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const recordingEvents = [];
const recordingTokens = new Set();
const playbackTimers = [];
let baseOctave = 4;
let audioContext;
let recordingStartedAt = 0;
let isRecording = false;
let isPlaying = false;

function createKey(note, midi, whiteIndex) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = `piano-key ${note.black ? "black-key" : "white-key"}`;
	button.dataset.octave = note.octave;
	button.dataset.midi = midi;
	button.dataset.note = note.note;
	button.setAttribute("aria-label", `${note.note}${note.octave}`);
	button.innerHTML = `<span class="key-note">${note.note}</span><span class="key-letter"></span>`;
	if (note.black) button.style.left = `${((whiteIndex + 0.69) / 52) * 100}%`;
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
}

function updateRecorder() {
	recordButton.classList.toggle("is-recording", isRecording);
	recordLabel.textContent = isRecording ? "녹음 중지" : "녹음";
	playLabel.textContent = isPlaying ? "정지" : "재생";
	recordButton.disabled = isPlaying;
	playButton.disabled = isRecording || recordingEvents.length === 0;
	clearButton.disabled = isRecording || isPlaying || recordingEvents.length === 0;
	const noteCount = recordingEvents.filter((event) => event.type === "on").length;
	recordingStatus.textContent = isRecording ? "REC · 녹음 중" : noteCount ? `${noteCount}개 음 녹음됨` : "녹음 없음";
}

function captureRecordingEvent(type, token, midi) {
	if (!isRecording) return;
	if (type === "off" && !recordingTokens.has(token)) return;
	if (type === "on") recordingTokens.add(token);
	else recordingTokens.delete(token);
	recordingEvents.push({ type, token, midi, time: performance.now() - recordingStartedAt });
}

function startNote(token, note, midi, keyElement = keyElements.get(midi)) {
	if (activeVoices.has(token)) return;
	captureRecordingEvent("on", token, midi);
	const frequency = 440 * 2 ** ((midi - 69) / 12);
	const context = audioContext ??= new AudioContext();
	if (context.state === "suspended") context.resume();

	const gain = context.createGain();
	const fundamental = context.createOscillator();
	const overtone = context.createOscillator();
	const now = context.currentTime;
	fundamental.type = "triangle";
	overtone.type = "sine";
	fundamental.frequency.value = frequency;
	overtone.frequency.value = frequency * 2.002;
	gain.gain.setValueAtTime(0.0001, now);
	gain.gain.exponentialRampToValueAtTime(0.22, now + 0.025);
	gain.gain.exponentialRampToValueAtTime(0.12, now + 0.18);
	fundamental.connect(gain);
	overtone.connect(gain);
	gain.connect(context.destination);
	fundamental.start(now);
	overtone.start(now);

	keyElement?.classList.add("is-active");
	activeVoices.set(token, { gain, fundamental, overtone, keyElement, midi });
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
	if (isPlaying) return;
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
	if (isRecording || recordingEvents.length === 0) return;
	isPlaying = true;
	updateRecorder();
	for (const event of recordingEvents) {
		const timer = window.setTimeout(() => {
			const token = `playback-${event.token}`;
			if (event.type === "on") startNote(token, { note: pitchNames[event.midi % 12] }, event.midi);
			else stopNote(token);
		}, event.time);
		playbackTimers.push(timer);
	}
	const duration = Math.max(...recordingEvents.map((event) => event.time));
	playbackTimers.push(window.setTimeout(stopPlayback, duration + 250));
}

function clearRecording() {
	if (isRecording || isPlaying) return;
	recordingEvents.length = 0;
	updateRecorder();
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

	const note = notes.find((entry) => entry.code === event.code);
	if (!note || event.repeat) return;
	event.preventDefault();
	heldCodes.add(event.code);
	const midi = (currentOctave() + 1) * 12 + notes.indexOf(note);
	startNote(`keyboard-${event.code}`, note, midi);
});

document.addEventListener("keyup", (event) => {
	heldCodes.delete(event.code);
	if (["ControlLeft", "ShiftLeft", "ShiftRight"].includes(event.code)) updateOctave();
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

updateOctave();
updateRecorder();
