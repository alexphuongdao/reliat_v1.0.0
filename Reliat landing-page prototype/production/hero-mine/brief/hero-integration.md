# Approved mine-hero integration

## Narrative

1. Open on the mine truck and primary crusher at full viewport.
2. Display “Every incident starts upstream.”
3. Hold the opening frame for 0.5 seconds, then play the complete source clip once at its native cadence.
4. Leave the final frame visible after playback; never loop the clip.
5. Fade the opening statement as the visitor begins scrolling.
6. Use a dark navy-green wipe at the end of the viewport to hand off directly
   to the conveyor/detection story.
7. Present the conveyor footage left-to-right beneath the original Reliat scan
   plane and registration trail.
8. Crossfade overlapping instances of the eight-second conveyor clip at the
   loop boundary so the material reads as a constant stream.

The previous “One oversize event…” scene remains in source only as an internal
indexing placeholder for the existing horizontal animation engine. It is hidden
in both cinematic and mobile visitor flows.

## Current prototype settings

- Desktop and mobile prelude length: `100vh`
- Playback: `0.5s` delay, then native one-shot playback
- Desktop crop: centered `cover`
- Mobile crop: centered `cover`, emphasizing rock and hopper
- Reduced motion: first video frame, no playback
- Conveyor presentation: horizontally mirrored to travel left-to-right
- Conveyor loop: 0.72-second two-layer crossfade
- Story palette: deep navy-green surfaces with warm-white type and muted
  green/teal data accents

The current 1280×720 source is suitable for prototyping. Replace it with an
approved 1080p or higher export before final deployment while preserving the
same filename and timing contract where practical.
