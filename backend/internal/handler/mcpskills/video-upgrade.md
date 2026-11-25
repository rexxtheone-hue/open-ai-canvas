---
name: video-upgrade
title: Upscale or add sound to a video
summary: Make a video sharper (up to 4K style detail) or add matching sound effects
use_when: upscale, higher resolution, sharper, enhance video quality, 4K, add sound effects, the video has no sound, add SFX
argument: the video and what to improve
---

# Upscale or add sound to a video

## 1. Choose

- Sharper or higher resolution → `operation: video_upscale` (OmniMuse Upscale).
- Silent video needs sound effects and ambience → `operation: video_sfx` (OmniMuse SFX Video to Video).
- Both → sound first, then upscale the result.

Ask only if unclear: `[Upscale / Add sound / Both]` and the target resolution from the model's list.

## 2. Generate

Pass the video as the first reference video. Use `list_models` to find the model that lists the operation and its resolutions. Prompt for upscale: "Upscale and sharpen, keep everything else identical." Prompt for SFX: describe the sounds wanted ("footsteps on wood, light rain, cafe ambience, no music, no speech").
Price is per second of the source video; estimate first.

## 3. Deliver

Show the before and after and mention the new resolution.
