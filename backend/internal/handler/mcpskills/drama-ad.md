---
name: drama-ad
title: Short drama ad
summary: A mini drama with a twist where the product solves the conflict
use_when: short drama ad, skit, story ad, 短剧广告, funny or emotional ad with characters and dialogue, series of episodes
argument: the product and the kind of story (funny, romantic, family, office)
---

# Short drama ad

A vertical mini drama (usually 15–60 seconds) with a relatable conflict, one twist, and a payoff where the product is the natural solution. Characters speak on screen. Quality comes from three stops the user sees: the plan, the pictures, the film.

## 1. Questions (skip what is clear; one round only)

- What do you have? `[A script / An idea / Nothing yet: suggest 3 story ideas]`
- Quality? `[480p draft first, then 1080p (recommended) / 720p / 1080p straight away]`
- How should I work? `[Step by step: I stop at the plan, pictures and film (recommended) / Full auto: I only stop if it costs more than planned]`
- Language of dialogue? `[Mandarin / Malay / English / Cantonese / Mixed like Malaysians speak]`

Tone and length come from the script or idea; ask only if unclear.

## 2. Stop 1: the plan

Load the `script` formula. Write or read the script, time it, stage each scene and cut it into clips (one place per clip, up to the model's maximum length). Show the user, in plain words: the script, the cast list, the places, how many clips and seconds, and the price of pictures and clips. Nothing is generated before a yes.

## 3. Stop 2: the pictures

- Characters: load the `characters` formula. For each speaking character make a face, an outfit flat-lay, then a character sheet from both. If the user gave photos or saved characters, still make a sheet from them so clothes stay consistent.
- Places and props: load the `places` formula. One empty wide view per location (Chinese prompt), a reverse view only when a scene needs shot/reverse-shot, and a picture only for props that matter. The user's product photo is used as is.
Generate faces, outfits, places and props together, then all sheets. Look at every result; show the set to the user with the clips price.

## 4. Clips and the film

Load the `clip` formula. Write every clip prompt in full before sending any. Make the clips at the draft quality, references in order (location, character sheets, product). Show the clips in order as the draft film. Clips that came back wrong are named in one line and left out; remake only on the user's request with its price.

After the user approves the draft, remake each kept clip at 1080p (if they chose that quality) and show the final clips in order.

## 5. Deliver

Show the clips in their play order with the script line each one covers, so the user can join them in OmniMuse Studio or any editor. Offer: the next episode with the same cast sheets, a cut-down 10 s teaser, or the dialogue as subtitle text.

## Progress messages

Plain words only (pictures, clips, film, credits; never tool, prompt or job). One status line when a stage starts and at least every 2 minutes while waiting: "Clips: 3 of 6 done, about 3 min left."
