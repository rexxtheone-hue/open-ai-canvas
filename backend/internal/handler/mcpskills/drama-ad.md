---
name: drama-ad
title: Short drama ad
summary: A mini drama with a twist where the product solves the conflict
use_when: short drama ad, skit, story ad, 短剧广告, funny or emotional ad with characters and dialogue, series of episodes
argument: the product and the kind of story (funny, romantic, family, office)
---

# Short drama ad

A 15–30 second vertical mini drama: a relatable conflict, an escalating moment, and a payoff where the product is the natural solution. Characters speak on screen.

## 1. Questions (skip what is clear)

- Tone? `[Funny / Heartwarming / Office drama / Family / Romance]`
- Language of dialogue? `[Mandarin / Malay / English / Cantonese / Mixed like Malaysians speak]`
- Length? `[15s / 20s / 30s]` (the longest the chosen model supports)
- Cast? `[Use my characters (give names or photos) / Create new characters]`

## 2. Write the episode

Write a beat sheet and the dialogue before any generation:
- Hook (0–3s): the conflict in one visual line ("Boss says the report is due in 10 minutes").
- Escalation (middle): one twist that raises stakes; keep it to one location if possible.
- Payoff (last 4–5s): the product solves it, a reaction line, and the product clearly in frame.
- Dialogue: short lines, at most 2.5 words (or 4 Chinese characters) per second in total. Malaysian setting and names unless the user says otherwise.
Show the beats, the cast list and the price in one plan.

## 3. Consistent cast

If the user gave character photos or saved characters, pass them as reference images in a fixed order and name them in the prompt ("the woman in image 1 is Mei"). If not, first generate one portrait per character with `generate_image` (neutral background, waist up), show them, then use those images as references for the video. Product image goes last.

## 4. Generate

Use a video model with reference_to_video and audio, preferring Seedance 2.5. 9:16, sound on.
Prompt: describe the shots in time order with cuts ("Shot 1, 0–3s, medium shot: …; Shot 2, 3–7s, close-up: …"), who says which line in which language, facial expressions, and end with "The product from image N appears exactly as in image N." Keep every character's clothes the same in all shots.
For a series, make one video per episode with the same references and a "previously" line in the hook.

## 5. Deliver

Offer the next episode, a cut-down 10s version, or subtitles-ready script text the user can paste into their editor.
