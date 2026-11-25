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

Write the spoken lines in the chosen language, about 2.5 words (or 4 Chinese characters) per second of video. Open with a hook in the first 2 seconds (a question, a bold claim or a visible problem). End with a short call to action ("Link di bawah", "点下方链接", "Tap the link"). Show the script to the user as part of the plan.

## 4. Generate

Use a video model whose operations include reference_to_video and which has generate_audio, preferring Seedance 2.5 (Flash for drafts). Settings: 9:16, the chosen duration, sound on, 720p for drafts or 1080p for the final.
References in order: image 1 = presenter (if any), image 2 = product.
Prompt structure:
"Vertical smartphone UGC video, handheld feel, natural window light, casual home setting. The person in image 1 [action] holding the product from image 2, which must look exactly like image 2 (same packaging, colours and label). Shot list: 0–2s [hook shot]; 2–Ns [demo shots, include one close-up of the product]; last 2s [call-to-action shot facing camera]. The person speaks [language] directly to camera, lips in sync, saying: "[script]". Authentic, not overly polished; no on-screen text; no music, only voice and room tone."

## 5. Deliver and extend

Offer: 3 hook variants of the same video (`/hook-variants`), a version in another language (`/localize-ads`), or a cleaner studio version. If the user has their own voice-over audio, use lip_sync instead: the presenter image or video plus the audio file.
