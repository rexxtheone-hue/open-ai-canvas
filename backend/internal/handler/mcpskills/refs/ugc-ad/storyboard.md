# Storyboard formula (one image of 8 frames per clip)

Before any video, draw the clip as 8 frames in one image. The video model then follows the frames, so the person, the product and the room stay the same in every cut. Generate the board, look at it, then animate it.

## Inputs, in this order of references

image 1 = product (if any) · image 2 = creator image · image 3 = the previous board (only for the second and later clips of a longer video).

## The 8 beats

Spread one clip's story over 8 frames: hook (frame 1) → set-up → the "but then" turn → product enters (around frames 3–5, not frame 1 unless the hook is a product cold open) → demonstration → close-up proof of one visible detail → reaction → call to action (frame 8).

Every neighbouring pair of frames must differ in three ways: camera type (selfie vs a phone propped up on a counter), distance (macro or tight vs medium vs wide) and action. That makes each frame boundary read as a hard cut, never a morph.

Hook frame ideas: something physical mid-action (box half-ripped, product mid-catch) · the face already in full reaction · a normal scene with one thing wrong · the product already doing its thing · a direct callout ("Mums in KL…").

## Hands rule (prevents extra fingers and floating products)

The person has two hands. In a selfie frame one hand holds the phone, so only one hand acts and only one object is held. Two-handed actions (opening a jar, pouring) are static-camera frames. Every frame names what each hand does, and the idle hand is parked (at her side, flat on the counter).

## Product rules

Real size, stated in centimetres ("about 12 cm tall, fits in one hand"). Exactly one product wherever it appears. It is fully in hand, fully hidden in a closed bag or box, or out of frame; never half-sticking out or balancing. Same visible angle as the product photo. Each prop has one state per frame (cap on or off, never both).

## Template

"[Image 1 is the exact product: same shape, colours and label, keep this angle.] [Image 2 is the person: identical face, hair, body and outfit in every frame.] [Image 3 is the previous board: keep identity, place, light, outfit and product state.] One storyboard sheet of exactly eight equal 9:16 vertical frames in one horizontal row, thin white gutters, white background. All eight frames are photorealistic iPhone-style UGC stills telling one [N]-second clip in order; frame 1 opens, frame 8 closes. Neighbouring frames differ in camera (selfie or propped static phone), distance and action. Same room, time of day and light direction as image 2 unless the story moves. The product is about [size] in real life and sits naturally in one hand.
Frame 1, 9:16, [selfie/static], [macro/tight/medium/wide]: [action; left hand …, right hand …; product in hand / hidden in … / not in frame; one small behaviour; light note].
Frame 2 … Frame 8 (each a different camera or distance from the one before).
Rendering rules: eight identical 9:16 frames in one row, no grid, no extra frames. Same person in all eight. Two hands only; selfie frames use one hand for the phone. Product at real scale, one only, never partial. No text anywhere: no captions, numbers, badges or watermarks; only the product's own label is legible. No bokeh, no lens flare, no beauty filter, no cinematic grade, no fisheye, no mirror shots, no extra or deformed hands, no other brands."

## Settings and checking

Model: an image model that accepts several references and wide ratios (Seedream or GPT Image class), the widest ratio offered (21:9; with only 16:9, use two rows of four and say "two rows of four"). Look at the board before animating: same face in all frames, product correct and single, hands believable, no text. Redo a board once if a frame breaks these rules.
