# bloub: notes for Claude

## Commands

```bash
pnpm dev       # 5190 (set in vite.config.ts, mirrored in .claude/launch.json)
pnpm test      # vitest
pnpm build     # vue-tsc --noEmit && vite build
```

Vue 3.5 + Vite 8 + TS strict + Tailwind 4 (`@tailwindcss/vite` plugin, no
`tailwind.config.js`), pnpm.

Style: 2 spaces, single quotes, **no semicolons**, comments in French. No ESLint
and no Prettier: `vue-tsc` is the only gate, so run `pnpm build` before
concluding.

## The most important rule

**The bot's numeric constants are measurements taken off the reference video, not
settings.** Gaze angles, eye sizes, radii, timings, colours: all of it comes from
frame-by-frame analysis. Don't round them, don't simplify them, don't replace them
with values that look tidier: it breaks the resemblance, which is the only
success criterion here.

The verified traps that must not be "corrected" are listed in
[docs/measurements.md](docs/measurements.md). Read it before touching a number in
`src/bot/`.

One deliberate exception: **`--ink` (`styles.css`) is the interface colour, chosen,
not measured**, a night blue. The video's black is the bot's, in `skins.ts`
(`encre`, `#0a0a0c`). Retouching one doesn't touch the other.

## Invariants worth knowing before editing

Details and the reasoning behind each are in [docs/](docs/):

- **`src/bot/` has no framework and no clock.** `engine.sample(t)` is a pure
  function of time. That's what makes `frozenAt`, the state board and the
  DOM-less tests work. No real-time state, no `Date.now()`, no Vue import. And
  **`sample()` must not mutate**: purging a stale previous state during playback
  makes the engine non-replayable (there's a dedicated test). Shared Vue code goes
  in `src/ui/`.
- **The montage holds or cuts, it never scales time** (`cycles.ts`). Hence
  `MIN_BLOCK` (0.6 s) and `StateDef.minDuration`, which is read off the state's
  `pose()` constants. Fill it in for any new narrative state.
- **All silhouettes share the same angular sampling** (`PROFILE_SAMPLES`), which is
  what makes morphing a linear interpolation of radii. A new shape must go through
  a radial profile, or `profileFromPolygon`.
- **The eyes are holes in a `<mask>`**, not white shapes on top. That's what makes
  them clip against the silhouette on their own. It's also what dresses the bot: the
  vest is drawn *inside* the mask, so it can't cover them. Anything painted *over* the
  body (the hard hat) gets the same holes punched a second time, into its own mask —
  otherwise the brim plugs an eye on the flatter shapes.
- **Anything sitting "on" the body must follow its real radius**: `radiusAtAngle`
  (defined in `shape.ts`, applied by `engine.ts`) for the eyes and the notification
  pastille. A new element anchored to the outline needs the same treatment.
- **States declare `ArcSpec`; only the engine rasterises.** Don't call `arcRender`
  from `states.ts`.
- **Transitions are exponential ease-outs and the body never overshoots.** The one
  spring is the notification pop (`NOTIF_POP = 1.14`). There is deliberately no
  spring engine. A new bouncing effect belongs in the state that needs it.
- **A third source of shapes: what the bot WEARS** (`accessories.ts`). Not bodies but
  objects laid on one, so an accessory never knows the chosen shape: it gets the
  silhouette's measurements at instant t (`BodyMetrics`) and sizes itself from them.
  It declares closed contours in ball-radius units, the engine rasterises. Like the
  chosen shape, worn objects only show on `baseBody` states. Each declares a `reach`,
  and that's what widens the export frame (`demiCadre`) so a hat isn't sliced off the
  top; a test checks the declaration against all eight shapes.
- **What the bot wears follows its head.** The engine measures the head anchor
  (`headTop`) and hands accessories the gap to the REST pose, so idle stays exactly
  where it was calibrated and things move only when the gaze does. `headTop` is not
  the sphere's pole on purpose: the pole's projection comes back *down* when the head
  tips back, so a hat pinned to it would sink as the bot looks up. It's taken 50° off
  the pole toward the face. The follow is damped and clamped per object; the hat's
  seat is re-measured at its new height (so it stays chaired on the skull) and pivots
  around that seat. The vest follows the SAME way and less far, which is the one
  knowing departure from the sphere: built to counter-move (correct for a decal), the
  states that look down pushed it up over the face, eyes in the middle of the orange.
  Its clamp is asymmetric because the obstacle is — nothing below, the eyes above.
  `reach` is declared for the REST pose only, because that's all a still export can
  contain; a tilted head goes past the tight frame but only ever on screen or in a
  cycle export, both on the wide viewBox.
- **An accessory declares ROLES, a finish paints them** (`finishes.ts`). Geometry
  carries `corps` / `clair` / `sombre` / `bande`, never a hex, so a new colour scheme
  costs no geometry and a new object costs no colour. The engine emits the role and
  `BloubBot.vue` resolves it, the same boundary the body's ink already sits on. The
  four finishes differ by where their colour COMES from: the object's own livery
  (`chantier`), its neon version (`fluo`), the bot's own colour (`mono`), a picked one
  (`accent`, the only `tinted: true` — which is why the swatches only show for it).
  Two rules are load-bearing and tested: `mono` must SHIFT the bot's colour or the kit
  turns invisible on the body it sits on, and a light shell flips its band dark or the
  reflective stripes vanish. Colours here are chosen, not measured, like `--ink`.
- **Two sources of shapes, not to be mixed.** `profiles.ts` is generated from the
  video and drives the animated states; `skins.ts` holds the customiser's shapes,
  built analytically. A user's shape only replaces the body on `baseBody` states
  (`idle`, `wink`, `wide`, `notify`, `swirl`); elsewhere the silhouette IS the
  animation.
- **Among catalogue states only `idle` carries `baseFace: true`** (`swirl` does too,
  but it isn't in the catalogue). The other face states have an expression measured
  off the video. That's the point.
- **A tilt is only visible on an elongated eye.** `expressions.test.ts` enforces it:
  width/height outside `[0.6, 1.7]` for a tilt of 20°+, outside `[0.8, 1.25]` below.
  Already went wrong once.
- **Labels don't live in `src/bot/`.** The catalogues carry ids and the display
  resolves `t('states.orbit')`. Their ids are **literal unions** so the compiler
  checks that every entry has a label in all three languages. Adding a shape
  without its label doesn't compile. (`StateDef.hint` is a leftover French string
  nothing reads.)
- **One state isn't measured: `swirl`**, the settings view's entry transition. It's
  deliberately outside `SEQUENCE` (a test locks that) and carries both `baseBody`
  and `baseFace`.
- **`mediabunny` is the only dependency besides Vue, and it must stay a DYNAMIC import.**
  It encodes the cycle's MP4 (`src/ui/video.ts`). Imported statically it adds **43 kB gzip**
  to the initial bundle, more than the 34 kB that got `vue-i18n` rejected in favour of the
  in-house layer. Behind `await import(...)` it costs 0.7 kB and only arrives when someone
  exports a video. Turning it into a top-level import would silently undo that.
- **A UI element that must appear once uses a `transition`, not an `animation`.** An
  animation replays on every mount: every view change, every reload. A transition
  doesn't run on an element's first computed style, so it stays quiet there. That's
  why `.panneau` and `.barre-export` are built that way, and why the latter is
  mounted-but-hidden during the arrival rather than absent.
- **`Look` aims in ABSOLUTE terms on both axes, and the engine does the mixing**:
  only it knows the pose at instant t. `mix` and `wander` are distinct, and drift is
  added *after* the mix. **`setLook` refuses a non-finite target**: the engine keeps
  the last one, so a single `NaN` would settle in forever.

## Where to read more

| | |
|---|---|
| [docs/architecture.md](docs/architecture.md) | The engine, morphing, mask eyes, `Look` |
| [docs/measurements.md](docs/measurements.md) | What was measured, the traps, regenerating `profiles.ts` |
| [docs/intro.md](docs/intro.md) | The arrival sequence, and why it plays only `idle` |
| [docs/interface.md](docs/interface.md) | Three-column scene, CSS traps, icons |
| [docs/export.md](docs/export.md) | The export bar, SVG/PNG/GIF/MP4, why the still export has no GIF |
| [docs/i18n.md](docs/i18n.md) | The hand-rolled translation layer |

The README is for people arriving at the repository: what the project is, how to
run it, the component's API. Don't duplicate it here.

## Generated files

`src/bot/profiles.ts` is produced by `tools/extract-profiles.py` from the video's
frames (see [docs/measurements.md](docs/measurements.md)). Don't edit it by hand;
regenerate it.

`public/favicon.svg` is not an approximation: its circle and **both eye matrices**
are what `engine.sample(1)` returns for `idle`, byte for byte. `favicon.ico` and
`apple-touch-icon.png` are rasterised from it.

`docs/demo.gif` and `docs/states.png` are the same idea: rendered by walking
`engine.sample(t)` and writing the SVG layers in `BloubBot.vue`'s order, then
`rsvg-convert` + `ffmpeg`. They are **not** browser captures: the browser pane
suspends `requestAnimationFrame` when hidden, so an animation can't be captured
there at all. To redo them, drive the engine, don't reach for a screenshot.

Same pane, related trap: when it is hidden it also **clamps `setTimeout` to ~1 s**
and freezes CSS transitions. So no sub-second timing can be measured there: a poll
written at 40 ms actually fires at 1 s, which reads as a delay the code never had.
Assert on the *state* instead (a `MutationObserver` still fires; an
`animation-delay` of `-1.5s` samples an animation mid-way while it is frozen).

## Useful URLs

- `#planche`: the 14 states side by side, frozen. The only safe path: it doesn't
  depend on any montage.
- `#arrivee`: replays the arrival. It otherwise only plays on a genuine visit, so
  without this link you can't see it again in a session.
- `#etat=<id>&stop`: opens one state, playback paused. It looks the state up in the
  user's montages, which are all editable: if they've removed it everywhere, the
  link doesn't apply.
