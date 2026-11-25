---
name: adapt-ad
title: Adapt a reference ad
summary: Remake an ad you like with your own product, people and setting while keeping its pacing and camera work
use_when: copy this ad, remake this video with my product, swap the product in this video, use this viral video as a template, replace the person or object in a video, 仿拍, 换产品
argument: the reference video and your product
---

# Adapt a reference ad

Keep what makes the reference work (timing, camera movement, structure) and replace the product, people or setting with the user's own.

## 1. Inputs

- Reference video (required): the user's upload, an asset from `list_assets`, or a public link. It should be 2–30 seconds.
- Product image (required) and optionally a person image or saved character.
- Only adapt videos the user owns or is allowed to reuse; do not copy another brand's logo, slogan or a recognisable person.

## 2. Choose the method

| Situation | Method |
|---|---|
| Same shot, only the product or one person should change | `operation: replace_element`. Reference video first, then the new product or person image. Prompt: "Replace the [object/person] in the video with the one in image 1. Keep all motion, camera movement, timing, lighting and background unchanged." |
| Change a detail by text (colour, background, remove a logo) | `operation: inpaint` with the video first. Prompt says exactly what to change and that everything else stays the same. |
| Same structure, new scene and cast | reference_to_video: the reference video plus product and person images. Prompt: "Recreate the pacing, shot order and camera movement of video 1 with the product from image 1 and the person from image 2 in [new setting]. Do not copy any text or logo from video 1." |
| Copy only the body movement onto a new character | `operation: motion_transfer`: character image plus the reference video. |

Check with `list_models` that the chosen model lists the operation; Seedance models support replace_element, inpaint, lip_sync and motion_transfer.

## 3. Questions (skip what is clear)

- What should change? `[Product only / Person only / Product and person / Whole scene]`
- Keep the original speech? `[Keep / New lines in my language / No speech]`
- Ratio and resolution if it should differ from the reference.

## 4. Deliver

Show the result next to a one-line note of what changed. Offer: another product colour, a version for another market (`/localize-ads`), or 3 opening hooks (`/hook-variants`).
