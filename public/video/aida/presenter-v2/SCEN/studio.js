import { createKeyer, presenterRect } from "./keyer.js";
import { mouthAtlas, paintMouth, paintVideoMouth, positionMouth } from "./mouth.js";

const el = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const editing = params.get("edit") === "1";
const embedded = params.get("embed") === "1";
document.body.classList.toggle("editing", editing);
document.body.classList.toggle("embedded", embedded);
el("director").hidden = !editing;
el("edit-link").hidden = editing;
el("edit-link").href = location.port === "5814" ? "/admin" : "/admin/alina";
el("chat-link").href = location.port === "5814" ? "http://127.0.0.1:3000/alina/chatt" : "/alina/chatt";
el("chat-link").target = "_top";
const stage = el("stage"),
  film = el("film"),
  draw = createKeyer(el("person"));
const idlePaths = {
  breath: "01-andetag.mp4?v=3",
  blink: "02-blinkning.mp4",
  glance: "03-sidoblick.mp4?v=4",
  nod: "04-nick.mp4",
  hair: "05-harkli.mp4?v=4",
  coffee: "VARIANTER/kaffepaus.mp4",
};
const titles = {
  blink: "Blinkning",
  glance: "Sidoblick",
  nod: "Nick",
  hair: "Hårkli",
  coffee: "Kaffepaus",
};
let config = {
  enabled: true,
  scene: "kvall",
  format: "wide",
  blur: 2,
  ambient: true,
  personal: true,
  entrance: true,
  voice: "sanna",
  method: "visemes",
  tempo: 1.25,
  chance: 50,
  idleMinutes: 10,
  weights: { blink: 30, glance: 28, nod: 18, hair: 16, coffee: 8 },
};
let phase = "A-IDLE",
  idle = "breath",
  epoch = 0,
  sourceVersion = 0,
  readySpeech = [],
  muted = false,
  bgTimer,
  bgAnim,
  paintId;
let lastActivity = Date.now(),
  sleepTimer,
  touchTimer,
  runtimeTimer;
let lastTouch = 0,
  lastWarmInput = 0,
  speechInFlight = null,
  connected = false;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const voicePlayer = new Audio();
const mouth = el("mouth");
let trackPlaying = null, answerPending = false, currentTurn = null, waitTimer, waitScheduled = false;
let mouthFrame = 0, dissolve = null;
const anchor = new Image();
anchor.onload = () => {
  if (sourceVersion > 0 && phase === "A-IDLE" && film.readyState < 2) draw(anchor);
};
anchor.src = "../IDLE/vilobild.png";
const entrancePoster = new Image();
entrancePoster.onload = () => {
  if (phase === "ENTRÉ" && film.readyState < 2) draw(entrancePoster);
};
entrancePoster.src = "entre-start.webp";
function reportState(value) {
  phase = value;
  el("state").textContent = value;
  stage.dataset.state = value;
  el("sleep-preview").textContent =
    value === "A-SOVA" || value === "SOMNAR" ? "Väck Alina" : "A-SOVA";
  if (parent !== window) parent.postMessage({ type: "alina:state", state: value }, location.origin);
}
function paintFilm(mediaTime = film.currentTime) {
  if (film.readyState < 2) return;
  let ledgeHands = null;
  if (phase === "SOMNAR" || phase === "VAKNAR") {
    const poseTime = phase === "SOMNAR" ? film.currentTime : film.duration - film.currentTime;
    ledgeHands = Math.min(1, Math.max(0, (poseTime - 0.64) / 0.24));
  }
  draw(film, ledgeHands);
  if (phase === "A-TALK" && !trackPlaying?.local) {
    paintVideoMouth(mouth, film, sourceVersion, mediaTime);
  }
}
function paint(_now, metadata) {
  paintFilm(metadata?.mediaTime);
  if (film.requestVideoFrameCallback) paintId = film.requestVideoFrameCallback(paint);
  else if (!film.paused) paintId = requestAnimationFrame(paint);
}
function restartPaint() {
  if (film.cancelVideoFrameCallback) film.cancelVideoFrameCallback(paintId);
  else cancelAnimationFrame(paintId);
  paint();
}
film.addEventListener("loadeddata", restartPaint);
film.addEventListener("playing", restartPaint);
function ambientEvent() {
  clearTimeout(bgTimer);
  bgAnim?.cancel();
  if (!config.ambient || reduced.matches) return;
  const boat = config.scene === "kvall";
  const item = stage.querySelector(boat ? ".boat" : ".passer");
  if (config.scene !== "bibliotek") {
    const from = boat ? "18%" : "4%",
      to = boat ? "83%" : "19%";
    bgAnim = item.animate(
      [
        { left: from, opacity: boat ? 0.8 : 0.65 },
        { left: to, opacity: boat ? 0.8 : 0.65 },
      ],
      { duration: boat ? 14500 : 2800, easing: "linear" },
    );
  }
  bgTimer = setTimeout(ambientEvent, 48000 + Math.random() * 39000);
}
function resizeSet() {
  const factor = Math.max(stage.clientWidth / 1672, stage.clientHeight / 941) * 1.1;
  el("set").style.width = 1672 * factor + "px";
  el("set").style.height = 941 * factor + "px";
  const rect = presenterRect(stage.clientWidth, stage.clientHeight, 3 / 4);
  stage.style.setProperty("--presenter-height", rect.height + "px");
  stage.style.setProperty("--presenter-top", rect.top + "px");
  positionMouth(stage, mouth);
  paintFilm();
}
new ResizeObserver(resizeSet).observe(stage);
function applyScene() {
  stage.dataset.format = config.format;
  stage.dataset.scene = config.scene;
  stage.style.setProperty("--blur", config.blur + "px");
  el("near").src = config.scene + ".webp";
  el("backdrop").src = el("near").src;
  stage.classList.toggle("ambient", config.ambient && !reduced.matches);
  bgAnim?.cancel();
  clearTimeout(bgTimer);
  if (config.ambient && !reduced.matches)
    bgTimer = setTimeout(ambientEvent, 8000 + Math.random() * 9000);
  resizeSet();
  if (parent !== window)
    parent.postMessage({ type: "alina:format", format: config.format }, location.origin);
}
reduced.addEventListener("change", applyScene);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.headers.get("content-type")?.includes("application/json"))
    throw Object.assign(Error("Kunde inte ansluta till Alinas studio."), {status: res.status});
  const data = await res.json();
  if (!res.ok) throw Object.assign(Error(data.error || "Begäran misslyckades."), {status: res.status});
  return data;
}
el("service-status").ontoggle = async () => {
  if (!el("service-status").open) return;
  try { el("studio-budget").textContent = (await api("/api/alina/runtime")).budget; }
  catch (error) { el("studio-budget").textContent = error.message; }
};
el("check-accounts").onclick = async () => {
  const button = el("check-accounts"), results = el("account-status");
  button.disabled = true;
  results.textContent = "Kontrollerar tjänsterna…";
  try {
    const data = await api("/api/alina/diagnostics", { check: "accounts" });
    el("studio-budget").textContent = data.Budget;
    results.replaceChildren();
    for (const name of ["RunPod", "ElevenLabs", "Talserver", "OpenClaw / Render"]) {
      const label = document.createElement("dt"), value = document.createElement("dd");
      label.textContent = name;
      value.textContent = data[name];
      results.append(label, value);
    }
  } catch (error) { results.textContent = error.message; }
  finally { button.disabled = false; }
};
el("check-openai").onclick = async () => {
  const button = el("check-openai"), status = el("openai-status");
  button.disabled = true;
  status.textContent = "Provar OpenAI…";
  try { status.textContent = (await api("/api/alina/diagnostics", { check: "openai" })).OpenAI; }
  catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
};
async function play(url, state, withSound = false, startAt = 0) {
  const version = ++sourceVersion;
  mouth.hidden = true;
  film.pause();
  film.muted = !withSound || muted;
  film.loop = false;
  film.src = url;
  if (startAt > 0) film.currentTime = startAt;
  reportState(state);
  if (state === "ENTRÉ" && entrancePoster.complete && entrancePoster.naturalWidth) {
    draw(entrancePoster);
  } else if (state === "A-IDLE" && version === 1 && anchor.complete && anchor.naturalWidth) {
    draw(anchor);
  }
  el("listen").hidden = true;
  el("set").classList.remove("camera");
  try {
    await film.play();
  } catch (error) {
    if (version !== sourceVersion) return;
    if (error.name === "NotAllowedError") el("listen").hidden = false;
  }
}
function playIdle(clip = "breath") {
  stopTrack();
  idle = clip;
  void play("../IDLE/" + idlePaths[clip], "A-IDLE");
}
function idleRemaining() {
  return lastActivity + (config.idleMinutes ?? 10) * 60000 - Date.now();
}
function scheduleSleep() {
  clearTimeout(sleepTimer);
  if (!["SOMNAR", "A-SOVA"].includes(phase))
    sleepTimer = setTimeout(checkSleep, Math.max(0, idleRemaining()));
}
function checkSleep() {
  if (["SOMNAR", "A-SOVA"].includes(phase)) return;
  if (idleRemaining() > 0) return scheduleSleep();
  if (answerPending || speechInFlight !== null || readySpeech.length || phase !== "A-IDLE") {
    sleepTimer = setTimeout(checkSleep, 1200);
    return;
  }
  // Meet the sleeping transition at the neutral last frame of the current idle clip.
  if (film.ended || film.error || film.paused) startSleep();
  else {
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
      if (
        idleRemaining() <= 0 &&
        phase === "A-IDLE" &&
        !answerPending &&
        speechInFlight === null &&
        !readySpeech.length
      )
        startSleep();
    }, 3500);
  }
}
function settleSleep() {
  film.pause();
  if (film.cancelVideoFrameCallback) film.cancelVideoFrameCallback(paintId);
  else cancelAnimationFrame(paintId);
  clearTimeout(bgTimer);
  bgAnim?.cancel();
  el("line").textContent = "";
  el("listen").hidden = true;
  reportState("A-SOVA");
}
function startSleep() {
  clearTimeout(sleepTimer);
  if (reduced.matches) settleSleep();
  else void play("../A-SOVA/somna.mp4?v=3", "SOMNAR");
}
function wake() {
  if (phase !== "A-SOVA" && phase !== "SOMNAR") return;
  const startAt =
    phase === "SOMNAR" && Number.isFinite(film.duration)
      ? Math.max(0, film.duration - film.currentTime - 0.04)
      : 0;
  applyScene();
  if (reduced.matches) playIdle();
  else void play("../A-SOVA/vakna.mp4?v=3", "VAKNAR", false, startAt);
}
const gpuStates = {
  sleeping: "GPU i vila",
  warming: "Laddar MuseTalk",
  ready: "MuseTalk redo",
  rendering: "Skapar läppsynk",
  cooling: "Stänger GPU:n",
  failed: "GPU-uppvärmningen misslyckades",
};
const seconds = (n) => Number(n).toLocaleString("sv-SE", { maximumFractionDigits: 1 }) + " s";
function showRuntime(data) {
  el("gpu-state").value =
    (gpuStates[data.status] || "GPU-status okänd") +
    (data.gpu ? " · senast verifierad " + data.gpu : "") +
    (data.warmupSeconds != null ? " · senaste uppvärmning " + seconds(data.warmupSeconds) : "");
}
async function refreshRuntime() {
  clearTimeout(runtimeTimer);
  if (!editing || !el("measurements").open || document.hidden) return;
  try {
    showRuntime(await api("/api/alina/runtime"));
  } catch (error) {
    el("gpu-state").value = error.message;
  }
  if (el("measurements").open && !document.hidden) runtimeTimer = setTimeout(refreshRuntime, 4500);
}
el("measurements").ontoggle = refreshRuntime;
function markActivity(warm) {
  lastActivity = Date.now();
  wake();
  scheduleSleep();
  if (!warm || !connected || !config.enabled || config.method === "visemes") return;
  lastWarmInput = lastActivity;
  clearTimeout(touchTimer);
  const sendTouch = () => {
    if (!config.enabled || config.method === "visemes") return;
    lastTouch = Date.now();
    void api("/api/alina/activity", {
      idleForMs: Math.min(15000, Math.max(0, lastTouch - lastWarmInput)),
    })
      .then(showRuntime)
      .catch((error) => {
        el("gpu-state").value = error.message;
      });
  };
  const delay = lastTouch + 15000 - Date.now();
  if (delay <= 0) sendTouch();
  else touchTimer = setTimeout(sendTouch, delay);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkSleep();
  void refreshRuntime();
});
function nextIdle() {
  if (answerPending || speechInFlight !== null || idle !== "breath" || reduced.matches || Math.random() * 100 >= config.chance) return "breath";
  const total = Object.values(config.weights).reduce((sum, v) => sum + v, 0);
  let ticket = Math.random() * total;
  for (const [key, v] of Object.entries(config.weights)) {
    ticket -= v;
    if (ticket < 0) return key;
  }
  return "breath";
}
function stopTrack() {
  const old = trackPlaying;
  trackPlaying = null;
  cancelAnimationFrame(mouthFrame);
  dissolve?.cancel();
  el("outgoing").hidden = true;
  voicePlayer.pause();
  mouth.hidden = true;
  if (old) old.finished?.(false);
}
function cancelSpeech() {
  epoch++;
  clearTimeout(waitTimer);
  waitScheduled = false;
  answerPending = false;
  speechInFlight = null;
  for (const track of readySpeech.splice(0)) track.finished?.(false);
  if (phase === "A-TALK" || phase === "ENTRÉ") playIdle();
  el("line").textContent = "";
}
function captureGesture() {
  if (reduced.matches || !["A-IDLE", "A-DATOR", "VAKNAR"].includes(phase) || film.readyState < 2) return false;
  const previous = el("outgoing"), person = el("person");
  dissolve?.cancel();
  paintFilm();
  previous.width = person.width;
  previous.height = person.height;
  previous.getContext("2d").drawImage(person, 0, 0);
  previous.hidden = false;
  return true;
}
function fadeGesture() {
  const previous = el("outgoing");
  if (previous.hidden) return;
  const anim = dissolve = previous.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 });
  anim.onfinish = () => { if (anim === dissolve) previous.hidden = true; };
}
function observeSpeech(track) {
  if (trackPlaying !== track) return;
  const media = track.local ? voicePlayer : film;
  if (track.local && !media.paused) paintMouth(mouth, track.metrics.cues, media.currentTime);
  if (track.onset != null && !track.measured && !media.paused && !media.muted && media.volume > 0 &&
      media.currentTime >= track.onset && media.currentTime > 0) {
    track.measured = true;
    const elapsed = Math.max(0, (Date.now() - track.readyAt) / 1000);
    if (track.helper) {
      el("measure-intro").value = track.label + " · första hörbara ord " + seconds(elapsed);
    } else {
      el("measure-" + track.method).value = track.label + " · första hörbara svarsord " + seconds(elapsed) +
      (track.blocked ? " (inklusive väntan på ljudgodkännande)" : "") + " · " + track.cacheLabel;
      stage.dataset.firstWordMs = String(Math.round(elapsed * 1000));
    }
  }
  mouthFrame = requestAnimationFrame(() => observeSpeech(track));
}
async function startTrack(track) {
  stopTrack();
  trackPlaying = track;
  const transition = captureGesture();
  if (track.local) {
    voicePlayer.src = track.url;
    voicePlayer.muted = muted;
    await play("../TAL/alina-a1-talbas.mp4", "A-TALK");
    if (trackPlaying !== track) return;
    film.loop = true;
    try {
      await mouthAtlas.decode();
      if (trackPlaying !== track) return;
      mouth.hidden = false;
      await voicePlayer.play();
    } catch (err) {
      if (trackPlaying !== track) return;
      if (err.name === "NotAllowedError") el("listen").hidden = false;
      else { el("line").textContent = "Munbilderna eller ljudet kunde inte laddas."; finishSpeech(false); return; }
    }
  } else {
    await play(track.url, "A-TALK", true);
  }
  if (trackPlaying !== track) return;
  if (transition) fadeGesture();
  track.blocked = !el("listen").hidden;
  if (track.blocked && track.onset != null)
    el("measure-" + track.method).value = track.label + " · väntar på ljudgodkännande";
  observeSpeech(track);
}
function speakReady() {
  const track = readySpeech.shift();
  if (!track) return false;
  el("line").textContent = track.text;
  void startTrack(track);
  return true;
}
function playRecorded(name, text, readyAt = Date.now()) {
  el("line").textContent = text;
  const intro = name === "sammanfattning";
  void startTrack({ url: "../TAL/" + name + ".mp4", text, helper: name, local: false,
    label: intro ? "Förinspelad inledning" : "Väntreplik", method: "intro",
    onset: intro ? 0.09 : 0.01, readyAt });
}
function finishSpeech(success = true) {
  const track = trackPlaying;
  trackPlaying = null;
  cancelAnimationFrame(mouthFrame);
  mouth.hidden = true;
  voicePlayer.pause();
  track?.finished?.(success);
  el("line").textContent = "";
  if (!speakReady()) playIdle();
}
voicePlayer.onended = () => { if (trackPlaying?.local) finishSpeech(); };
voicePlayer.onerror = () => { if (trackPlaying?.local) finishSpeech(false); };
film.onended = () => {
  if (phase === "SOMNAR") return settleSleep();
  if (phase === "ENTRÉ" || phase === "A-DATOR" || phase === "VAKNAR") {
    if (!speakReady()) playIdle();
  } else if (phase === "A-TALK") {
    if (!trackPlaying?.local) finishSpeech();
  } else if (phase === "A-IDLE") {
    if (idleRemaining() <= 0 && !answerPending && speechInFlight === null && !readySpeech.length) return startSleep();
    if (!speakReady()) playIdle(nextIdle());
  }
};
film.onerror = () => {
  if (phase === "A-TALK" && trackPlaying) return finishSpeech(false);
  if (phase === "SOMNAR") return settleSleep();
  if (phase === "A-IDLE") {
    if (anchor.complete) draw(anchor);
    return;
  }
  el("line").textContent = "Klippet kunde inte laddas.";
  if (!speakReady()) playIdle();
};
film.ontimeupdate = () => {
  if (phase === "A-DATOR")
    el("set").classList.toggle(
      "camera",
      film.currentTime > film.duration * 0.22 && film.currentTime < film.duration * 0.78,
    );
};
el("listen").onclick = async () => {
  try {
    await film.play();
    if (trackPlaying?.local) await voicePlayer.play();
    el("listen").hidden = true;
  } catch {
    el("line").textContent = "Tryck på spela för att fortsätta.";
  }
};
el("audio").onclick = () => {
  muted = !muted;
  if (phase === "A-TALK") {
    if (trackPlaying?.local) voicePlayer.muted = muted;
    else film.muted = muted;
  }
  el("audio").textContent = muted ? "Slå på ljud" : "Stäng av ljud";
  el("audio").setAttribute("aria-pressed", String(muted));
};
function speechParts(text) {
  let remaining = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = [];
  if (remaining.length > 180 && typeof Intl.Segmenter === "function") {
    const first = new Intl.Segmenter("sv", { granularity: "sentence" }).segment(remaining)[Symbol.iterator]().next().value?.segment.trim();
    if (first && first.length >= 24 && first.length <= 160) {
      parts.push(first);
      remaining = remaining.slice(first.length).trim();
    }
  }
  while (remaining.length > 450) {
    const head = remaining.slice(0, 450);
    const stops = [...head.matchAll(/[.!?](?=\s)/g)];
    const sentence = stops.at(-1)?.index;
    const space = head.lastIndexOf(" ");
    const end = sentence !== undefined ? sentence + 1 : space > 0 ? space : head.length;
    parts.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}
async function queueSpeech(body, {method = config.method, readyAt = Date.now(), waitForEnd = false, voiceSpec, audition = false} = {}) {
  if (!audition && (!connected || !config.enabled)) return false;
  const endpoint = audition ? "/api/alina/audition" : "/api/alina/speech";
  const current = ++epoch;
  answerPending = false;
  speechInFlight = current;
  for (const old of readySpeech.splice(0)) old.finished?.(false);
  const requests = body.kind === "reply" && !waitForEnd
    ? speechParts(body.text).map((text) => ({ kind: "reply", text, method }))
    : [{ ...body, method, ...voiceSpec }];
  const label = method === "visemes" ? "Munbilder" : "MuseTalk";
  try {
    if (!requests.length) return false;
    let job = await api(endpoint, requests[0]);
    for (let index = 0; index < requests.length; index++) {
      if (current !== epoch) return false;
      const next = index + 1 < requests.length
        ? api(endpoint, requests[index + 1]).then(value => ({ value }), error => ({ error }))
        : null;
      if (phase !== "A-TALK") el("line").textContent = job.text;
      let status = job.status, metrics;
      const deadline = Date.now() + 16 * 60000;
      if (job.id) {
        let failedReads = 0;
        do {
          if (current !== epoch) return false;
          let result;
          try {
            result = await api("/api/alina/jobs/" + job.id + "?wait=1");
            failedReads = 0;
          } catch (error) {
            const temporary = error instanceof TypeError || [502, 503, 504].includes(error.status);
            if (!temporary || ++failedReads > 3) throw error;
            status = "pending";
            await sleep(500 * failedReads);
            continue;
          }
          if (result.error) throw Error(result.error);
          status = result.status;
          metrics = result.timings;
          if (status === "pending") await sleep(120);
        } while (status === "pending" && Date.now() < deadline);
      }
      if (current !== epoch) return false;
      if (status !== "ready") throw Error("Läppsynken blev inte klar. Texten finns kvar.");
      const local = metrics?.method === "visemes";
      const reused = job.videoCached || !!job.url;
      const gpu = local || reused ? "ingen GPU behövdes" :
        (metrics?.warm ? "varm GPU" : "kall GPU") + (metrics?.gpu ? " · " + metrics.gpu : "");
      const renderLabel = local ? (reused ? "tidslinje från cache" : "ny tidslinje")
        : (reused ? "video från cache" : "ny video");
      const cacheLabel = (reused || metrics?.audioCached ? "ljud från cache" : "nytt ljud") +
        " · " + renderLabel + " · " + gpu;
      if (editing) el("reply-times").value = label + " · " + cacheLabel +
        (metrics && !reused ? " · förberett på " + seconds(metrics.totalSeconds) : "");
      let finished;
      const ended = waitForEnd ? new Promise(resolve => { finished = resolve; }) : null;
      readySpeech.push({ url: job.url || "/api/alina/media/" + job.id, text: job.text,
        local, method, label, cacheLabel, metrics, readyAt, finished,
        onset: body.kind === "reply" && index === 0 ? metrics?.onset : null });
      if (phase !== "A-TALK" && (body.kind === "reply" || phase === "A-IDLE")) speakReady();
      if (ended && !await ended) return false;
      if (next) {
        const result = await next;
        if (result.error) throw result.error;
        job = result.value;
      }
    }
    return true;
  } catch (err) {
    if (current === epoch) el("line").textContent = err.message;
    return false;
  } finally {
    if (speechInFlight === current) speechInFlight = null;
  }
}
function greet(audition = false) {
  if (!audition && (!connected || !config.enabled)) return;
  markActivity(true);
  if (config.entrance && !reduced.matches) void play("entre.mp4?v=2", "ENTRÉ");
  else playIdle();
  void queueSpeech({ kind: "welcome", testName: editing ? el("name").value.trim() : "" }, {audition});
}
el("start").onclick = el("welcome").onclick = () => greet(editing);
const replyText = el("reply-text");
const tryReply = el("try-reply");
replyText.oninput = () => {
  markActivity(false);
  tryReply.disabled = el("compare").disabled = speechParts(replyText.value).length === 0;
};
async function probe(compare) {
  cancelSpeech();
  markActivity(false);
  const text = replyText.value.trim();
  const voiceSpec = { voice: config.voice, tempo: config.tempo };
  tryReply.disabled = el("compare").disabled = replyText.readOnly = true;
  el("measurements").open = true;
  if (compare) {
    el("measure-musetalk").value = "";
    el("measure-visemes").value = "";
  }
  try {
    const body = { kind: "reply", text };
    if (compare) {
      // Independent clocks: the second measurement excludes the first audition.
      if (await queueSpeech(body, {method: "visemes", waitForEnd: true, voiceSpec, audition: true}))
        await queueSpeech(body, {method: "musetalk", waitForEnd: true, voiceSpec, audition: true});
    } else await queueSpeech(body, {waitForEnd: true, voiceSpec, audition: true});
  } finally {
    replyText.readOnly = false;
    tryReply.disabled = el("compare").disabled = !replyText.value.trim();
  }
}
tryReply.onclick = () => probe(false);
el("compare").onclick = () => probe(true);
el("sample").onclick = () => {
  markActivity(false);
  cancelSpeech();
  el("line").textContent = "Hej, jag heter Alina. Jag öppnar mappen och visar dig bilden.";
  void play("../TAL/alina-sanna-musetalk-1_25x.mp4", "A-TALK", true);
};
el("computer").onclick = () => {
  markActivity(false);
  cancelSpeech();
  el("line").textContent = "";
  void play("../A-DATOR/v2/A-DATOR-v2.mp4?v=3", "A-DATOR");
};
el("event").onclick = ambientEvent;
el("sleep-preview").onclick = () => {
  if (phase === "SOMNAR" || phase === "A-SOVA") return markActivity(false);
  cancelSpeech();
  startSleep();
};
for (const [id, title] of Object.entries(titles)) {
  const label = document.createElement("label");
  const output = document.createElement("output");
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  input.id = "w-" + id;
  label.append(title + " ", output, input);
  const preview = document.createElement("button");
  preview.type = "button";
  preview.textContent = "Spela";
  preview.setAttribute("aria-label", "Provspela " + title.toLowerCase());
  preview.onclick = () => {
    markActivity(false);
    cancelSpeech();
    el("line").textContent = "";
    playIdle(id);
  };
  const row = document.createElement("div");
  row.className = "weight-row";
  row.append(label, preview);
  el("weights").append(row);
  input.oninput = () => {
    config.weights[id] = Number(input.value);
    output.value = input.value;
    el("saved").value = "Osparade ändringar";
  };
}
const choices = ["scene", "format", "voice", "method"],
  flags = ["ambient", "entrance", "personal", "enabled"],
  numbers = ["blur", "chance", "tempo", "idleMinutes"];
function hydrate() {
  for (const id of choices) el(id).value = config[id];
  for (const id of flags) el(id).checked = config[id];
  for (const id of numbers) {
    el(id).value = config[id];
    el(id + "-value").value =
      config[id].toLocaleString("sv-SE") +
      { blur: " px", chance: " %", tempo: "×", idleMinutes: " min" }[id];
  }
  for (const [id, v] of Object.entries(config.weights)) {
    const input = el("w-" + id);
    input.value = v;
    input.previousElementSibling.value = v;
  }
  applyScene();
}
for (const id of [...choices, ...flags, ...numbers])
  el(id).oninput = () => {
    config[id] = flags.includes(id)
      ? el(id).checked
      : numbers.includes(id)
        ? Number(el(id).value)
        : el(id).value;
    hydrate();
    if (id === "idleMinutes") scheduleSleep();
    el("saved").value = "Osparade ändringar";
  };
el("director").onsubmit = async (event) => {
  event.preventDefault();
  try {
    config = await api("/api/admin/alina", config);
    hydrate();
    el("saved").value = "Sparat";
  } catch (err) {
    el("saved").value = err.message;
  }
};
window.addEventListener("message", (event) => {
  if (parent === window || event.origin !== location.origin || event.source !== parent) return;
  if (!connected || !config.enabled) return;
  if (event.data?.type === "alina:activity") markActivity(true);
  if (event.data?.type === "alina:question") {
    cancelSpeech();
    currentTurn = event.data.turn;
    answerPending = true;
    markActivity(true);
  }
  if (event.data?.type === "alina:cancel" && event.data.turn === currentTurn) cancelSpeech();
  if (event.data?.type === "alina:wait" && event.data.turn === currentTurn && answerPending && !waitScheduled) {
    waitScheduled = true;
    const awaiting = currentTurn;
    waitTimer = setTimeout(() => {
      if (currentTurn === awaiting && answerPending)
        playRecorded("vantar", "Låt mig fundera lite.");
    }, 900);
  }
  if (event.data?.type === "alina:reply" && typeof event.data.text === "string") {
    if (event.data.turn !== currentTurn || !answerPending) return;
    clearTimeout(waitTimer);
    if (trackPlaying?.helper === "vantar") playIdle();
    if (phase === "A-SOVA" || phase === "SOMNAR") markActivity(true);
    if (event.data.summary)
      playRecorded("sammanfattning", "Jag har sammanfattat lite mer utförligt nedan.", event.data.readyAt);
    void queueSpeech({ kind: "reply", text: event.data.text }, {readyAt: event.data.readyAt ?? Date.now()});
  }
});
(async () => {
  try {
    config = { ...config, ...(await api("/api/alina/config")) };
    connected = true;
  } catch (error) {
    el("saved").value = error.message;
  }
  hydrate();
  if (parent !== window) parent.postMessage({ type: "alina:ready" }, location.origin);
  if (connected && config.enabled && !editing) greet();
  else if (editing && params.get("pose") === "sova") startSleep();
  else {
    playIdle();
    scheduleSleep();
  }
})();
