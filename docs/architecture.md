# Architecture

## The engine has no framework and no clock

`engine.sample(t)` is a pure function of time. That is what makes the `frozenAt`
prop, the frozen state board and the DOM-less tests possible.

So `src/bot/` must not gain internal state that depends on real time, nor
`Date.now()`, nor a Vue import. Vue code shared between components (composables,
display settings) goes in `src/ui/` instead.

**`sample()` must not mutate either.** Purging a "stale" previous state during
playback looks like an innocent optimisation and makes the engine non-replayable:
re-reading a date from before the end of a fade would no longer find it. This
already went wrong once, on the shape morph, and there is a dedicated test for it
(`engine.test.ts`, "reste une fonction pure du temps pendant un morph de forme").

## The montage holds or cuts, it never scales time

`cycles.ts` stretches a block by letting the state run longer (looping states do
extra turns, the others hold their final pose) and shortens it by cutting. It
never multiplies local time by a speed factor, which would be tempting and would
break every measured duration at once.

Hence two floors:

- `MIN_BLOCK` (0.6 s): the engine keeps only one slot of history, so a block
  shorter than the next one's entry morph would jump on screen. 0.6 s is also the
  longest `morph` in the catalogue (`orbit`).
- `StateDef.minDuration`: the date at which the animation resolves, read off the
  constants in that state's `pose()`. Worth filling in for any new narrative
  state.

## Every silhouette shares the same angular sampling

All profiles are sampled at the same angles (`PROFILE_SAMPLES`, 64), so any two
shapes have points that correspond one to one and a transition reduces to a linear
interpolation of radii. That is why there is no path-morphing library here.

Any new shape has to go through a radial profile, or through `profileFromPolygon`
if it isn't expressible as `r(theta)`.

## Two sources of shapes, not to be mixed

`profiles.ts` is generated from the video and drives the animated states.
`skins.ts` holds the customiser's shapes, built analytically. A shape the user
picks only replaces the body on states flagged `baseBody`: `idle`, `wink`,
`wide`, `notify` and `swirl`. Everywhere else the silhouette *is* the animation
and must not be overwritten.

## Worn objects are a third source of shapes

`accessories.ts` holds what the bot *wears* — the hard hat, the hi-vis vest. It is
neither `profiles.ts` (measured off the video) nor `skins.ts` (the customiser's
bodies): those are bodies, these are objects laid **on** a body, so an accessory
never knows which shape was chosen. It is handed the silhouette's measurements at
instant *t* (`BodyMetrics`: top, bottom, and the horizontal chord at a height) and
sizes itself from them. That is what keeps the hat on the head of a hexagon and off
the tip of a droplet.

Same division of labour as the states: an accessory declares closed contours in
ball-radius units and only the engine rasterises them. It doesn't carry colours
either — each part declares the **role** it plays (`corps`, `clair`, `sombre`,
`bande`) and a **finish** paints it (`finishes.ts`). That is what lets a colour
scheme be added without touching a single contour, and an object without writing a
single hex. The engine emits the role, `BloubBot.vue` resolves it, exactly where
the body's ink is already resolved.

The four finishes differ by where the colour comes from, not by taste: the
object's own livery (`chantier`, the real material), its neon version (`fluo`),
the bot's own colour (`mono`), or a picked one (`accent` — the only one that reads
the swatches, hence `tinted`, hence a palette that only appears for it). Two of
the rules are there to keep the object visible rather than to look nice, and both
are tested: `mono` has to SHIFT the bot's colour — taken as-is, the kit would be
exactly the colour of the body wearing it — and a shell lighter than 0.62 luma
flips its reflective bands dark, or a cream vest comes out plain.

They follow the same rule as the chosen shape — they only appear on `baseBody`
states, and cross-fade with them — because everywhere else the silhouette *is* the
animation: a hard hat riding the "!" across the screen means nothing.

## What you wear follows the head

The body is a head, so an object on it can't sit at a fixed height: when the bot
looks up the hat has to rise, and slide to the side the head turns to. The engine
measures where the head is pointing (`headTop`, face.ts) and hands accessories the
gap to the **rest pose** (`HeadTilt`). Measuring against that pose rather than
against a level head is what keeps the placement calibrated: idle-with-drift is
exactly where it was tuned, and things only move when the gaze really moves.

`headTop` is deliberately **not** the geometric pole of the sphere, and that is the
trap this function exists for. On a sphere the pole tips backward as the head
lifts, so its projection comes back *down* the screen — a hat pinned to it would
sink exactly when the bot looks up. The anchor is taken 50° off the pole toward the
face, where a hat is actually worn: it rises with the gaze, slides with the yaw and
leans with the roll.

The motion is damped and clamped, per object (`*_SUIVI`, `*_ROULIS`), because the
head turns far more than what sits on it — the anchor travels 0.9 radius between
extreme poses. The hat's seat is also **re-measured** at its new height, so it
re-chairs itself on the skull's chord there instead of floating above it, and it
pivots around that seat: a helmet tips on a head, it doesn't orbit around it. The
vest moves the *other* way, since it is painted on the same ball and a ball that
rotates lowers its bottom while its top rises.

One consequence for exports: `reach` is declared **for the rest pose**, since that
is all a still export can contain. A properly tilted head takes the hat out to 1.41
radii, past the tight frame — but that only ever shows on screen or in a cycle
export, and both run on the wide ±158 viewBox. Two tests, one per bound.

Their colours are **chosen**, not measured, like `--ink`: a site vest is hi-vis
orange because that is what makes it readable as one, whatever colour the bot is.

## The eyes are holes in a `<mask>`

Not white shapes laid on top. That is what makes them clip themselves against the
silhouette when they slide towards the edge, with no cropping code. The
notification pastille's notch uses the same mask.

Because a hole shows whatever is drawn behind it, and the back half of the rings
and the burst particles *are* drawn behind the body to be occluded by it, the body
is backed by an opaque path in the page's `paper` colour. Without it, a ring
passing behind the ball reappears inside the eyes.

The mask is also what dresses the bot: the vest is drawn **inside** it, so the
silhouette cuts it to shape and it cannot cover the eyes, whatever body it is worn
on. What sticks out of the body can't use that mask — the hat has to be painted over
the ball — so the same eye holes are punched a second time, into a mask of their own
(clipped to the body, or the hole would open onto nothing outside the silhouette).
Without it the brim would plug an eye on the flatter shapes, where the eyes ride
higher than the top of the skull.

## Anything sitting "on" the body must follow its real radius

The eyes live on a sphere of radius 1; on a non-circular shape they leave the
silhouette and the mask cuts them. Hence `radiusAtAngle`, defined in `shape.ts`,
applied by `engine.ts` to the eyes and to the notification pastille. Any new
element anchored to the outline needs the same treatment.

## States declare `ArcSpec`, the engine rasterises

Geometry in `ArcSpec` is expressed in ball-radius units; only the engine knows the
viewBox scale. Don't call `arcRender` from `states.ts`.

The rings are 3D circles in orthographic projection: the `z` component splits each
arc in two, and the back half is drawn *before* the body so the body occludes it.
That depth sort is what makes them read as orbits rather than as flat drawing.

## Springs are local and deliberate

Transitions are exponential ease-outs (the curve measured on the video) and the
body never overshoots. The one spring effect is the notification pastille's pop
(`NOTIF_POP = 1.14`). There is deliberately **no spring engine** in the project;
a new bouncing effect belongs in the state that needs it.

## The rest expression is adjustable, the states' silhouettes are not

Among the catalogue states, only `idle` carries `baseFace: true`. The other states
that show a face (wink, wide eyes, notification) have an expression measured off
the video, and that is precisely what's being reproduced. (`swirl` also carries
`baseFace`, for the reason below.)

## A tilt is only visible on an elongated eye

`EyeCfg.tilt` tilts each eye independently, which anger and sadness need since
they call for mirrored tilts. But an eye whose width/height ratio approaches 1 is
a circle: it looks the same at every angle and the tilt is invisible. This went
wrong once, so `expressions.test.ts` now enforces a two-tier rule: the ratio must
fall outside `[0.6, 1.7]` for a tilt of 20° or more, and outside `[0.8, 1.25]`
below that.

## Labels don't live in `src/bot/`

The catalogues (`states.ts`, `skins.ts`, `expressions.ts`) carry **ids**, and the
display resolves `t('states.orbit')`. The corollary is that their ids are
**literal unions** (`ShapeId`, `ColorId`, `ExpressionId`, `StateId`), not for
neatness, but because that is what makes the compiler check that every entry has
its label in all three languages. Adding a shape without its label doesn't
compile.

One exception, and it's an oversight rather than a design: `StateDef.hint` still
holds a hardcoded French string per state. Nothing reads it.

## One state is not measured: `swirl`

It's the entry transition for the settings view, chosen rather than measured (like
`--ink`). It sits deliberately **outside `SEQUENCE`** (so it appears in neither
the palette nor the board, and a test locks that) and carries both `baseBody` and
`baseFace`, which is what lets it morph from the user's chosen shape towards the
ball and lets gaze tracking apply from its very first frame.

## `Look` aims in absolute terms, and the engine does the mixing

`yaw` and `pitch` replace the pose's own as `mix` rises, and that mix has to be
done by the engine because only it knows the pose *at instant t*. A caller
compensating for the expression's orientation would read its **arrival** value
while the morph was still running, and the eyes would jump on every mood change.

It also has to be absolute on **both** axes. In relative terms the eye height
followed each expression's own, and "neutral" looks about 30° higher than the
others, so the eyes dropped all at once on the first mood change. What
distinguishes a mood during tracking is the **shape** of its eyes, not where it
looks.

`spin` is a turn taken *on the way*: free on a sphere, and with no effect on the
destination since -360° is the same angle as 0.

**`mix` and `wander` are not the same thing.** `mix` says how much the outside
world commands the direction; `wander` is what remains of automatic drift. When
the pointer moves, the drift must die out: added together, the bot would look
like it was hunting for the cursor without ever holding it. But with **no** pointer
(arriving by keyboard, by touch, or the mouse having left the window) the head must
stay turned *and* keep living. Conflating them froze the gaze the moment the view
opened. So drift is added **after** the mix, otherwise the target would cancel it
along with the pose.

**`setLook` refuses a non-finite target.** The engine keeps the last one: a `NaN`
set even once takes up residence and the bot never rests again. This happened for
real: a `getBoundingClientRect` on a zero-sized box (hidden browser pane) gives
`0 / 0` in the caller. The caller is fixed, but the engine shouldn't depend on its
callers being careful.

## Colours: two blacks that don't move together

`--ink` (`styles.css`) is the **interface** colour, a night blue, chosen, not
measured. The video's black is the bot's, in `skins.ts` (`encre`, `#0a0a0c`).
Retouching one doesn't touch the other.
