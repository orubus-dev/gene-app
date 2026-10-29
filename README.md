# Gene — the app

**Package:** `app.orubu.gene` · **Mind:** trained organism v1 · **Cloud:** none.

Open the app → tap **Download Gene** (~0.6 MB) → chat. She runs entirely
on-device after that: airplane mode, no signal, no problem.

## What she can do (from the trained mind v1)

- **Natural chat** — greetings, small talk, identity, 39-case conversational battery green
- **Science recall** — biology, chemistry, physics, geography (390+ concepts): organs,
  elements, reactions, continents, forces — `what does the heart do`, `symbol of gold`,
  `react hydrogen and oxygen`
- **Live algebra** — she evaluates, solves, rearranges and *fuses* equations she was
  taught: `solve eq_ke for v with e=50 m=1` → `10`
- **Memory** — 260+ long-term memories, autobiography, prospective intentions that fire
  when their topic walks past, honest inventory of what she knows
- **A brain you can look at** — 14 regions, 9 neurotransmitters, chemical emotions, and
  a 3D voxel scan merged from human + mouse + octopus + crow + dolphin scans

## How it works

```
┌────────────── your phone ──────────────┐
│  PWA shell (HTML/CSS/JS, ~20 KB)       │
│    ↓ tap "Download Gene"               │
│  model/gene-mind.zip  (0.40 MB)        │  ← her trained state
│  model/gene-src.zip  (0.21 MB)         │  ← her instincts (pure Python)
│    ↓ unpacked into Pyodide (WASM)      │
│  gene.mind.Mind → respond(text)        │  ← ~1–15 ms per answer, no server
└────────────────────────────────────────┘
```

The python runtime (Pyodide, ~10 MB) is fetched once from CDN and cached by the
service worker; her mind is fetched once from this repo and cached in the Cache
API. After that the app is fully offline.

## Repo layout

- `index.html`, `app.css`, `app.js`, `sw.js`, `manifest.webmanifest` — the app
- `model/` — the two downloadable bundles (built from the Gene repo)
- `tools/build_bundles.py` — rebuild bundles from a Gene checkout: `python3 tools/build_bundles.py ../Gene`
- `tools/make_icons.py` — regenerate icons
- `twa/twa-manifest.json` — Trusted Web Activity config (package `app.orubu.gene`)
  for producing a Play-Store APK via Bubblewrap when wanted

## Install on a phone (no store needed)

1. Open the site URL in Chrome (Android) or Safari (iOS)
2. **Android:** menu → *Add to Home screen* / *Install app*
   **iOS:** Share → *Add to Home Screen*
3. Launch Gene from your home screen — standalone, no browser chrome

## Bumping her mind

Retrain in the Gene repo, then:

```bash
python3 tools/build_bundles.py /path/to/Gene
# bump MODEL_VER in app.js (e.g. v1 → v2) so installed apps re-download
```

## License

MIT — see [LICENSE](LICENSE).

## Android APK

`.github/workflows/android.yml` builds + signs `app.orubu.gene` on every push
touching `android/` and attaches the APK to the GitHub release. The TWA
points at the Pages site; `/.well-known/assetlinks.json` carries the signing
fingerprint so the URL bar is hidden. Keystore is committed (personal
project, reproducible builds) — rotate before any public distribution.
