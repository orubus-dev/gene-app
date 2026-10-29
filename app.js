/* Gene app — download her mind, wake her, chat. All on-device. */
"use strict";

const PYODIDE_VERSION = "0.26.4";
// self-hosted: same origin as the app — no CDN can come between Gene and her files
const PYODIDE_BASE = "./pyodide/";
// Android shell serves us from appassets — everything is already on the device
const EMBEDDED = location.hostname === "appassets.androidplatform.net";
const MODEL_VER = "v1"; // bump when bundles are rebuilt with new training
const URL_MIND = `./model/gene-mind.zip?v=${MODEL_VER}`;
const URL_SRC = `./model/gene-src.zip?v=${MODEL_VER}`;
const URL_INSTALLED = `./model/installed.json?v=${MODEL_VER}`;
const CACHE_MODEL = `gene-model-${MODEL_VER}`;

const $ = (id) => document.getElementById(id);
const elLanding = $("landing"), elChat = $("chat");
const elBtnDl = $("btn-download"), elProgress = $("dl-progress"),
      elBar = $("dl-bar"), elDlStatus = $("dl-status"),
      elBoot = $("boot-status"), elBootLabel = $("boot-label");
const elMessages = $("messages"), elInput = $("input"),
      elSend = $("btn-send"), elSuggestions = $("suggestions");
const elMood = $("topbar-mood");

let pyodide = null;
let respondFn = null, moodFn = null, panelFn = null;

/* ---------------- landing / download ---------------- */

async function cachedModel() {
  if (!("caches" in window)) return null;
  try {
    const hit = await caches.match(URL_INSTALLED, { cacheName: CACHE_MODEL });
    return hit ? await hit.json() : null;
  } catch { return null; }
}

async function fetchOnce(url, onPct) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    if (total) onPct(got / total);
  }
  return new Blob(chunks);
}

async function fetchWithProgress(url, onPct, tries = 4) {
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fetchOnce(url, onPct);
    } catch (e) {
      lastErr = e;
      if (attempt < tries) await new Promise((r) => setTimeout(r, attempt * 900));
    }
  }
  throw new Error(`${url.split("/").pop()}: ${lastErr && lastErr.message ? lastErr.message : lastErr} (after ${tries} tries)`);
}

async function downloadModel() {
  elBtnDl.disabled = true;
  elBtnDl.querySelector(".btn-label").textContent = "Downloading…";
  elProgress.classList.remove("hidden");

  const cache = await caches.open(CACHE_MODEL);
  const parts = [
    { url: URL_MIND, label: "her trained mind" },
    { url: URL_SRC, label: "her instincts" },
  ];
  // both bundles are ~0.2–0.4 MB; one shared progress bar weighted by size
  const weights = [0.65, 0.35];
  const blobs = [];
  let done = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    elDlStatus.textContent = `downloading ${p.label}…`;
    const blob = await fetchWithProgress(p.url, (frac) => {
      elBar.style.width = `${Math.round((done + weights[i] * frac) * 100)}%`;
    });
    blobs.push(blob);
    done += weights[i];
    await cache.put(p.url, new Response(blob));
  }
  await cache.put(URL_INSTALLED, new Response(JSON.stringify({
    version: MODEL_VER, at: new Date().toISOString(),
  }), { headers: { "content-type": "application/json" } }));
  elBar.style.width = "100%";
  return { mind: blobs[0], src: blobs[1] };
}

/* ---------------- boot ---------------- */

const BOOT_PY = `
import sys, os, zipfile, io
HOME = "/home/pyodide"
os.makedirs(HOME + "/mind", exist_ok=True)
os.makedirs(HOME + "/lib", exist_ok=True)
zipfile.ZipFile(HOME + "/gene-mind.zip").extractall(HOME + "/mind")
zipfile.ZipFile(HOME + "/gene-src.zip").extractall(HOME + "/lib")
sys.path.insert(0, HOME + "/lib")
from gene.mind import Mind
M = Mind(root=HOME + "/mind")

def respond(text):
    r = M.handle_text(str(text))
    return r if isinstance(r, str) else str(r)

def mood_word():
    try:
        w = M.brain.emotion_word()
        return "" if w is None else str(w)
    except Exception:
        return ""

def brain_panel():
    out = []
    try:
        out.append("== her mood ==")
        w = M.brain.emotion_word()
        out.append(str(w) if w else "(quiet)")
    except Exception as e:
        out.append("mood: " + str(e))
    try:
        out.append("")
        out.append("== chemicals ==")
        out.append(M.brain.levels_line())
    except Exception:
        pass
    try:
        out.append("")
        out.append("== self-report ==")
        s = M.status_text()
        out.append(s if isinstance(s, str) else str(s))
    except Exception as e:
        out.append("status: " + str(e))
    try:
        out.append("")
        out.append("== 3d brain scan (merged: human, mouse, octopus, crow, dolphin) ==")
        out.append("\\n".join(M.brain.render_slices()))
    except Exception as e:
        out.append("scan: " + str(e))
    return "\\n".join(out)

"booted"
`;

function loadPyodideScript() {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PYODIDE_BASE + "pyodide.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("could not load the python runtime"));
    document.head.appendChild(s);
  });
}

async function loadPyodideRuntime() {
  elBootLabel.textContent = EMBEDDED
    ? "unpacking the python runtime…"
    : "fetching the runtime (first time only, ~14 MB)…";
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { await loadPyodideScript(); lastErr = null; break; }
    catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  if (lastErr) throw new Error("runtime unreachable — " + lastErr.message);
  elBootLabel.textContent = "starting python…";
  return await loadPyodide({ indexURL: PYODIDE_BASE });
}

async function wake({ mind, src }) {
  elLanding.classList.add("hidden");
  elChat.classList.remove("hidden");
  elBoot.classList.remove("hidden");
  elBootLabel.textContent = "unpacking her mind…";

  pyodide = await loadPyodideRuntime();
  pyodide.FS.writeFile("/home/pyodide/gene-mind.zip", new Uint8Array(await mind.arrayBuffer()));
  pyodide.FS.writeFile("/home/pyodide/gene-src.zip", new Uint8Array(await src.arrayBuffer()));

  elBootLabel.textContent = "waking her up…";
  const msg = await pyodide.runPythonAsync(BOOT_PY);
  if (msg !== "booted") throw new Error("boot failed: " + msg);

  respondFn = pyodide.globals.get("respond");
  moodFn = pyodide.globals.get("mood_word");
  panelFn = pyodide.globals.get("brain_panel");

  elBoot.classList.add("hidden");
  updateMood();
  if (!elMessages.children.length) {
    const hi = safeRespond("hello") || "…";
    addMsg("her", hi);
    addMsg("sys", "she's awake — everything from here on happens on this device");
  }
  elInput.focus({ preventScroll: true });
}

/* ---------------- chat ---------------- */

function addMsg(kind, text) {
  const div = document.createElement("div");
  div.className = `msg ${kind}`;
  if (kind === "her typing") {
    for (let i = 0; i < 3; i++) div.appendChild(document.createElement("span"));
  } else if (kind === "her" && /^brain scan\b/.test(text)) {
    const pre = document.createElement("pre"); // ASCII 3D scan → monospace
    pre.textContent = text;
    div.appendChild(pre);
  } else {
    div.textContent = text;
  }
  elMessages.appendChild(div);
  elMessages.scrollTop = elMessages.scrollHeight;
  return div;
}

function safeRespond(text) {
  try {
    const r = respondFn(text);
    return typeof r === "string" ? r : String(r);
  } catch (e) {
    return "she stumbled in there — " + (e && e.message ? e.message : e);
  }
}

function updateMood() {
  try {
    const w = moodFn();
    elMood.textContent = w ? `feels ${w} · on-device` : "on-device";
  } catch { elMood.textContent = "on-device"; }
}

async function send(text) {
  text = (text || "").trim();
  if (!text || !respondFn) return;
  elSuggestions.classList.add("hidden");
  addMsg("you", text);
  const typingEl = addMsg("her typing", "");
  // she answers in ~1–15 ms; the tiny delay just lets the UI breathe
  await new Promise((r) => setTimeout(r, 120));
  const reply = safeRespond(text);
  typingEl.remove();
  addMsg("her", reply);
  updateMood();
}

elSend.addEventListener("click", () => { send(elInput.value); elInput.value = ""; });
elInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { send(elInput.value); elInput.value = ""; }
});
elSuggestions.addEventListener("click", (e) => {
  if (e.target.classList.contains("chip")) send(e.target.textContent.replace("?", ""));
});

/* ---------------- brain sheet ---------------- */
$("btn-brain").addEventListener("click", () => {
  $("brain-sheet").classList.remove("hidden");
  const body = $("brain-body");
  body.textContent = "looking in…";
  setTimeout(() => {
    try { body.textContent = panelFn(); }
    catch (e) { body.textContent = "she blinked — " + e; }
  }, 60);
});
$("btn-brain-close").addEventListener("click", () =>
  $("brain-sheet").classList.add("hidden"));
$("brain-sheet").addEventListener("click", (e) => {
  if (e.target === $("brain-sheet")) $("brain-sheet").classList.add("hidden");
});

/* ---------------- service worker ---------------- */
if ("serviceWorker" in navigator && !EMBEDDED) {
  // if a waiting SW takes over mid-session, reload so the page runs fresh code
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    if (navigator.serviceWorker.controller) location.reload();
  });
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

/* ---------------- start ---------------- */
(async function start() {
  // Android shell: her whole mind is already inside the APK — no download, no network
  if (EMBEDDED) {
    try {
      const mind = await (await fetch("./model/gene-mind.zip")).blob();
      const src = await (await fetch("./model/gene-src.zip")).blob();
      await wake({ mind, src });
      return;
    } catch (e) {
      elBtnDl.disabled = false;
      elBtnDl.querySelector(".btn-label").textContent = "Try again";
      elDlStatus.textContent = "that didn't work — " + e.message;
    }
  }
  const installed = await cachedModel();
  if (installed && installed.version === MODEL_VER) {
    const cache = await caches.open(CACHE_MODEL);
    const mind = await (await cache.match(URL_MIND)).blob();
    const src = await (await cache.match(URL_SRC)).blob();
    try {
      await wake({ mind, src });
      return;
    } catch (e) {
      console.warn("fast boot failed, falling back to fresh download", e);
    }
  }
  elBtnDl.addEventListener("click", async () => {
    try {
      const blobs = await downloadModel();
      await wake(blobs);
    } catch (e) {
      elBtnDl.disabled = false;
      elBtnDl.querySelector(".btn-label").textContent = "Try again";
      elDlStatus.textContent = "that didn't work — " + e.message;
    }
  });
})();
