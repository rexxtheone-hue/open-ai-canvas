---
name: resize-ads
title: Resize ads for every placement
summary: Refit one ad image to feed, story, banner and marketplace sizes without stretching or cropping off the text
use_when: resize, other sizes, all placements, story version, 9:16 version, banner size, Shopee size, fit for TikTok, Instagram story, Facebook feed and story
argument: the ad image and the placements needed
---

# Resize ads for every placement

Re-compose (not stretch) an existing ad for each placement, keeping the product, text and brand look identical.

## 1. Placements

| Placement | Ratio |
|---|---|
| Facebook and Instagram feed | 4:5 |
| Square post, Shopee and Lazada main image | 1:1 |
| Stories, Reels, TikTok | 9:16 |
| Website or YouTube banner | 16:9 |
| Pinterest | 2:3 |

Ask once: `[All of these / Feed + Story / Pick placements]`. Skip the ratio the source already has.

## 2. Generate

Use an image model that accepts a reference image and renders text well. For each ratio:
"Recompose image 1 into a [ratio] layout for [placement]. Keep the exact same product, headline text, colours, fonts and logo; do not change or translate any text. Rearrange the elements to fit the new frame, extend the background naturally, keep important text inside the central safe area (for 9:16 leave the top and bottom 15% clear)."
Also quote the headline text exactly in the prompt so it is not altered.

## 3. Deliver

Group results by placement name. Check every version for changed or misspelled text and redo any that drifted.
