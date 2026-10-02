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
const heldCodes = new Set();
const activeVoices = new Map();
const keyElements = new Map();
let baseOctave = 4;
let audioContext;

function createKey(note, index) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = `piano-key ${note.black ? "black-key" : "white-key"}`;
	button.dataset.code = note.code;
	button.dataset.note = note.note;
	button.setAttribute("aria-label", `${note.name}, ${note.key} 키`);
	button.innerHTML = `<span class="key-note">${note.name}</span><span class="key-letter">${note.key}</span>`;
	keyElements.set(note.code, button);

	button.addEventListener("pointerdown", (event) => {
		event.preventDefault();
		button.setPointerCapture(event.pointerId);
		startNote(`pointer-${event.pointerId}`, note, index);
	});
	button.addEventListener("pointerup", (event) => stopNote(`pointer-${event.pointerId}`));
	button.addEventListener("pointercancel", (event) => stopNote(`pointer-${event.pointerId}`));
	button.addEventListener("lostpointercapture", (event) => stopNote(`pointer-${event.pointerId}`));
	return button;
}

notes.forEach((note, index) => {
	const button = createKey(note, index);
	if (note.black) {
		blackKeys.append(button);
	} else {
		whiteKeys.append(button);
	}

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
	rangeLabel.textContent = `C${octave} — B${octave}`;
}

function startNote(token, note, index) {
	if (activeVoices.has(token)) return;
	const octave = currentOctave();
	const midi = (octave + 1) * 12 + index;
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

	const keyElement = keyElements.get(note.code);
	keyElement?.classList.add("is-active");
	activeVoices.set(token, { gain, fundamental, overtone, keyElement });
}

function stopNote(token) {
	const voice = activeVoices.get(token);
	if (!voice) return;
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

document.addEventListener("keydown", (event) => {
	if (event.ctrlKey && event.code === "KeyS") event.preventDefault();
}, true);

document.addEventListener("keydown", (event) => {
	if (["ControlLeft", "ShiftLeft", "ShiftRight"].includes(event.code)) {
		heldCodes.add(event.code);
		updateOctave();
		return;
	}

	const noteIndex = notes.findIndex((note) => note.code === event.code);
	if (noteIndex === -1 || event.repeat) return;
	event.preventDefault();
	heldCodes.add(event.code);
	startNote(`keyboard-${event.code}`, notes[noteIndex], noteIndex);
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

updateOctave();
