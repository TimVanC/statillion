# Runner sprite feedback — please regenerate the folders below

Same character and style as before (128×128 transparent PNGs, feet on row 121, side view facing RIGHT, headband, white singlet with red stripe, black shorts, red/white shoes). Keep the pixel density and palette identical across every folder so frames cut together cleanly. Numbered PNGs in playback order plus the spritesheet, as you did.

Global requirements that apply to EVERY folder:

1. **Constant character scale.** The runner must be the same height/head size in every frame of every folder. Several frames came back enlarged (see trip_and_fall below). Use the standing height from `runner_animation` as the reference and do not rescale when the pose changes.
2. **No background artifacts.** Many frames contain a thin vertical gray/blue-gray line (2–4 px wide, 100+ px tall) near the figure, sometimes touching it. The background must be fully transparent with nothing but the character (and small dust/breath puffs where appropriate).
3. **Nothing clipped.** Keep the whole figure inside the 128×128 canvas with a few pixels of margin; several frames were cut off at the canvas edge.
4. **Consistent facing.** Always facing right, never mirrored.

---

## runner_animation (run cycle) — REGENERATE

The current 8 frames are all the same half of the stride: the right (near) leg is forward in every frame, so the cycle looks like he's hopping. I need a FULL stride:

- Frames 1–4: right leg drives forward through contact → mid-stance → push-off → trailing behind, while the left leg swings forward.
- Frames 5–8: the mirror phase — LEFT leg forward through the same four poses, right leg trailing.
- Arms opposite the legs (left arm forward when right leg is forward).
- Frames 1 and 5 should be the two "flight" moments with both feet off the ground; 3 and 7 the two foot-contact moments.
- Vertical bob of a few pixels (lowest at contact, highest in flight), but the feet of the planted foot must land on row 121.

Looping frame 8 → frame 1 must be seamless.

## trip_and_fall — REGENERATE frames 7–12

Frames 1–6 (running into the stumble) are good. From frame 7 onward the character is drawn roughly 1.4× larger than in frames 1–6 (head and torso are much bigger when he hits the ground and sits up). Redraw 7–12 at exactly the same scale as frames 1–6: the length of his body lying down should equal his standing height. Keep the sequence: stumble → arms out → face-first slide with dust → push up → sitting, dazed, holding a knee. Hold-able final frame.

## celebration — REGENERATE frames 4, 9, 10 and 11

Frames 4, 10 and 11 contain large gray rectangular blocks and partial duplicate figures; frame 9 is clipped at the right edge. Frames 1, 2, 3, 5, 6, 7, 8 and 12 are fine. Please redraw the four bad frames so the full 12 read as one loop: fist pump → jump with knee up → both arms up in the air → land → arms wide. Match the pose scale of the good frames exactly.

## exhausted_stop — GOOD, minor cleanup only

Sequence and scale are right. Only fix the vertical line artifact in frames 2–6 (see global point 2).

## finish_line_lean — GOOD

No changes needed.

## idle_animations (bouncing / breathing / stretching) — GOOD, minor cleanup only

All three loops are usable. Remove any stray line artifacts (bouncing frames 2–4) and make sure each loop's last frame flows into its first.

---

## New folder requested: `get_up`

6–8 frames, 128×128, same scale: from the final sitting pose of `trip_and_fall` (frame 12) back to the standing ready pose of `idle_bouncing` frame 1 — plant a hand, push up to a knee, stand, shake it off. This lets him recover before the next prompt instead of cutting straight from the ground to running.
