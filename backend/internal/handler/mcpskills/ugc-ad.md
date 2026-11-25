---
name: ugc-ad
title: UGC product video
summary: A creator-style talking video that reviews, unboxes, demonstrates or tries on a product
use_when: UGC, creator video, influencer style, product review, testimonial, unboxing, tutorial or how-to, try-on, talking head ad, TikTok or Reels ad with a person speaking
argument: the product, who should present it, and the language
---

# UGC product video

One vertical video where a believable creator talks to camera about the product, with natural speech, product close-ups and a call to action.

## 1. Pick the format

| Format | Story shape |
|---|---|
| review | problem the viewer has, product as the fix, one clear proof, call to action |
| unboxing | parcel opened, product revealed, first reaction, key detail close-up, verdict |
| how-to | 2–3 steps of using the product, result shown, tip at the end |
| try-on | wearing the item, turn to show fit, detail close-up, styling tip |
| testimonial | "I was sceptical…", what changed, recommendation |

## 2. Questions (skip what is clear)

- Format? `[Review / Unboxing / How-to / Try-on / Testimonial]`
- Presenter? `[Use my photo or character / Make a new creator: describe age, gender, style]`
- Language of speech? `[Mandarin / Malay / English / Cantonese]`
- Length? `[10s / 15s / 20s]` (default 15s, 9:16)

Need the product image. A presenter photo is optional; with none, describe the creator in the prompt and keep it consistent if more videos follow.

## 3. Write the script first

Load the `script` formula. Pick a story shape and a hook, write the lines in the chosen language within the word budget, and show the script in the plan. Plan clips of at most 15 s each (a 15 s video is one clip; longer videos are several clips delivered in order).

## 4. Generate in three stages (each stage priced in the plan)

1. Creator image: load the `creator` formula. Skip if the user gave their own photo or a saved character (use it as is).
2. Storyboard: load the `storyboard` formula and make one 8-frame board per clip, product as image 1 and creator as image 2. Look at each board before going on; redo once if the face, product or hands are wrong.
3. Video: load the `clip` formula and animate each board with Seedance 2.5 (Flash for drafts), reference_to_video, sound on, 9:16. References: board, creator, product.

Show the boards to the user before the video stage when they chose step-by-step; in full-auto mode go straight on within the approved price.

## 5. Deliver and extend

Offer: 3 hook variants of the same video (`/hook-variants`), a version in another language (`/localize-ads`), or a cleaner studio version. If the user has their own voice-over audio, use lip_sync instead: the presenter image or video plus the audio file.
