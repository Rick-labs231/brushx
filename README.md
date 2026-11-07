# Brush X

**Animate faster. Create freely.** — templates + tools, not a replacement for artists.

Web-first build (Vite + React + TypeScript) following the Brush X Master Blueprint v0.3.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test           # engine unit tests (Node 22.6+)
npm run build
```

## Status

| Phase | Scope | State |
|---|---|---|
| 0 Foundation | modules, routing, state store, Brand Bible tokens, reusable UI | done |
| 1 Drawing engine | pencil, ink, brush, airbrush, marker, chalk, crayon, eraser (standard/hard/soft), fill, color picker, line/rect/ellipse/polygon, select + lasso (move/rotate/scale/flip, copy/cut/paste across frames), colour wheel + 84-colour palette, symmetry, stabilizer, pressure, pan/zoom/rotate, undo/redo, autosave | done |
| 2 Layers | add, delete, duplicate, rename, reorder (drag or buttons), lock, hide, opacity, merge down | done |
| 3 Animation | frame strip, exposure holds (×1–24), In/Out work range, keyframe dots, timeline zoom, onion skin with custom prev/next colours and opacity, playback that honours holds and range | done; **camera keyframes** added in 0.5.1 (pan / zoom / rotate with smooth, linear or hold easing; plays back and exports through the camera); **sound** added in 0.6.0 (import MP3/WAV/OGG/M4A, waveform under every frame, synced playback, offset/volume/mute, "add frames to cover it", mixed into MP4/WebM); **scenes** added in 0.7.0 (split the timeline into named scenes with timeline tags; reorder, duplicate, play or export one scene) |
| 6 Export | PNG frame (transparent option), GIF, PNG sequence as ZIP, `.brushx` backup, **MP4 (H.264) and WebM (VP9)** with social presets (YouTube, TikTok, Instagram Reel/Post, X), frame rate, quality, work-range export; encoded in the browser with WebCodecs and our own muxers | done; needs a browser with WebCodecs (recent Chrome/Edge; Safari support varies) |
| 4 Template engine | 58 browsable items: 44 templates (anatomy, poses, animals, objects, environment) plus 14 motion cycles ("Run → 8 frames"); turnable sphere-based head; scale/rotate/move/flip/stretch/opacity/line weight; stamp a guide into a frame as editable lines; search, categories, favourites; 9 perspective modes with vanishing-point spread and line snapping | done |
| 5 Project system | new project presets, autosave, rename, duplicate, archive, delete, thumbnails, recent projects; project settings (rename, FPS, background, canvas resize with anchor, one undo step); version history (automatic restore point every 5 min plus manual, restore is undoable); "Save a copy"; sort; Backup all (.zip) and zip import; storage meter; unsaved-exit notice | done |
| 7 Accounts and cloud | email + password accounts and per-project sync through your own Supabase project (plain HTTP, no SDK); sound included; conflicts keep both versions; deletes sync safely; sync badges on project cards | done; **tested against a local mock of Supabase only, see below** |
| 7.5 Media and small tools | pictures and video into a project (trace layer or part of the animation), Paste guide, curve pen, text, crop, brush presets, editable tool keys | done |
| 7.6 Mobile and Android | phone layout and touch checks, web manifest, safe areas, Capacitor wrapper, GitHub workflow that builds a test APK (docs/ANDROID.md) | done; **APK pipeline written but never run** |
| 7.7 Guided tour and website | interactive first-run guide for Home, Projects, Profile and the editor (Next/Back/Skip, replay from ? and Profile), X app icon, showcase website in `site/` with Ricknova section, sharing guide (docs/SHARING.md), GitHub Pages workflow | done; **workflows never run** |
| 7.8 Tester fixes (0.10.2) | motion cycles can be inserted as an exported drawing or as a guide; per-layer "Include this layer in exports" switch; fixed a stale-frame cache that ignored guide on/off | done; 159 unit tests, browser suites pass |
| 7.9 Signed releases and update notice (0.10.3) | workflow builds a signed release APK from GitHub secrets (docs/SIGNING.md) with a rising versionCode; the installed app checks the latest GitHub release and shows a Download banner, plus Profile > Version > Check for updates | done; **never run on real GitHub/Android** |
| 8+ | community, marketplace, AI | deferred until after the Play Store upload |

Everything from Phase 1 is now built.

### Known limits
- Imported video is stored as small bitmap frames (up to 240 frames, ~56 MB per clip), so large clips are soft and projects holding them save slowly. Projects over 45 MB aren't cloud-synced.
- Imported pictures, video frames and text can be moved but not rotated, scaled or flipped yet.
- Automatic restore points are skipped for projects holding over 24 MB of imported pixels.
- Duplicated frames that hold imported bitmaps are written to `.brushx` files in full each time (no de-duplication yet).

## Structure

```
src/cloud    Supabase client, sync orchestration, config (no React)
src/engine   pure TypeScript: strokes, brushes, layers, history, rendering, storage. No React.
             Written so it can move to React Native (Skia) later.
src/state    store, router, actions (all mutations), autosave, shortcuts
src/ui       canvas stage, icons, shared controls
src/editor   toolbar, panels, timeline, dialogs
src/screens  home, projects, profile, placeholders
src/brand    design tokens (tokens.css) and component styles
tests        engine + cloud unit tests, and a mock Supabase server (tests/mock-supabase.ts)
```

Projects are stored in the browser (IndexedDB). "Save project file" exports a portable `.brushx` backup.

## Cloud sync setup (Supabase)

1. Create a free project at supabase.com.
2. In **SQL editor**, paste and run `docs/supabase-setup.sql`. It creates the `projects` table and a private `brushx` file bucket, with rules so each person only reaches their own data.
3. In **Authentication → Providers → Email**, choose whether new accounts must confirm their email. Both work; with confirmation on, Brush X tells people to check their inbox.
4. In **Project Settings → API**, copy the Project URL and the `anon` public key.
5. Either open **Profile → Account and cloud** in Brush X and paste them, or put them in `.env.local` so everyone using your build is already connected:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Never put the `service_role` key anywhere in the app. The anon key is meant to be public; the table and bucket rules are what protect the data.

How sync behaves: each project is one `.brushx` file in storage plus a row with its name, size and times. Edits upload shortly after autosave; the app also syncs on start, when you return to the tab, when you come back online, and from the Sync now button. If a project changed on two devices, the newer one keeps its name and the other is kept as "(conflict copy)". Deleting a project deletes it everywhere, but only on devices where you haven't edited it since. A project open in the editor is never overwritten; it updates after you close it. Per-project limit is 50 MB (set in the SQL).

Tests: `npm test` runs engine and cloud tests. The cloud tests use `tests/mock-supabase.ts`, which imitates Supabase's auth, table and storage endpoints.
