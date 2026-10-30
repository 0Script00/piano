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
const audioStatus = document.querySelector("#audio-status");
const heldCodes = new Set();
const activeVoices = new Map();
const keyElements = new Map();
const pitchNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const recordingEvents = [];
const recordingTokens = new Set();
const playbackTimers = [];
const recordingStorageKey = "key-piano-recordings-v1";
const soundfontBaseUrl = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/";
const soundfonts = {
	piano: "acoustic_grand_piano",
	electric: "electric_piano_1",
	organ: "drawbar_organ",
	ocarina: "ocarina",
	flute: "flute",
	trombone: "trombone",
};
const soundfontPromises = new Map();
const sampleBufferPromises = new Map();
const soundfontScripts = new Map();
let savedRecordings = [];
let loadedRecordingId = null;
let baseOctave = 4;
let audioContext;
let recordingStartedAt = 0;
let isRecording = false;
let isPlaying = false;

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
	saveRecordingButton.disabled = isRecording || isPlaying || recordingEvents.length === 0;
	const noteCount = recordingEvents.filter((event) => event.type === "on").length;
	recordingStatus.textContent = isRecording ? "REC · 녹음 중" : noteCount ? `${noteCount}개 음 녹음됨` : "녹음 없음";
}

function captureRecordingEvent(type, token, midi, instrument = instrumentSelect.value) {
	if (!isRecording) return;
	if (type === "off" && !recordingTokens.has(token)) return;
	if (type === "on") recordingTokens.add(token);
	else recordingTokens.delete(token);
	recordingEvents.push({ type, token, midi, instrument, time: performance.now() - recordingStartedAt });
}

function getAudioContext() {
	audioContext ??= new AudioContext();
	if (audioContext.state === "suspended") audioContext.resume();
	return audioContext;
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

function startNote(token, note, midi, keyElement = keyElements.get(midi), instrument = instrumentSelect.value) {
	if (activeVoices.has(token)) return;
	captureRecordingEvent("on", token, midi, instrument);
	const context = getAudioContext();
	const gain = context.createGain();
	gain.gain.value = 0.8;
	gain.connect(context.destination);
	keyElement?.classList.add("is-active");
	const voice = { gain, source: null, keyElement, midi, instrument };
	activeVoices.set(token, voice);
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
	if (isPlaying) return;
	if (isRecording) {
		const stopTime = performance.now() - recordingStartedAt;
		for (const token of recordingTokens) {
			const voice = activeVoices.get(token);
			if (voice) recordingEvents.push({ type: "off", token, midi: voice.midi, instrument: voice.instrument, time: stopTime });
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
	if (isRecording || isPlaying) return;
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
				(event.instrument === undefined || Object.hasOwn(soundfonts, event.instrument)),
			),
		) : [];
	} catch {
		return [];
	}
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
saveRecordingButton.addEventListener("click", saveCurrentRecording);

savedRecordings = readSavedRecordings();
renderSavedRecordings();
instrumentSelect.addEventListener("change", () => {
	instrumentLabel.textContent = instrumentSelect.selectedOptions[0].textContent;
	prepareInstrument(instrumentSelect.value);
});
instrumentLabel.textContent = instrumentSelect.selectedOptions[0].textContent;
prepareInstrument(instrumentSelect.value);
updateOctave();
updateRecorder();
