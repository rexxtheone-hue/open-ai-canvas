---
name: product-photoshoot
title: Product photoshoot
summary: A set of studio, lifestyle and ad-ready photos from one product picture
use_when: product photo, studio shot, lifestyle image, Shopee/Lazada/Shopify images, hero banner, carousel, model holding or wearing the product, floating/splash/CGI product, restyle an existing product image
argument: what the product is and where the photos will be used
---

# Product photoshoot

Turn one product picture into a coordinated set of brand-quality images.

## 1. Pick the mode

| Mode | When the user wants | Default ratio |
|---|---|---|
| studio | clean catalog shot on a plain or gradient background | 1:1 |
| lifestyle | product in a real scene: kitchen, cafe, office, gym, outdoors | 4:5 |
| hands | close-up with hands holding, applying or demonstrating | 4:5 |
| model | product worn or used by a person (fashion, beauty, accessories) | 3:4 |
| hero | wide banner for a website, email or Shopee shop header | 16:9 |
| carousel | 3–6 connected slides that share one look | 1:1 or 4:5 |
| concept | levitating, splash, frozen motion, surreal or CGI-style | 1:1 |
| restyle | same product image, new season, mood or festive theme | keep the source ratio |

Prefer the more specific mode when two fit (a "carousel of lifestyle shots" is carousel).

## 2. Questions (skip what is already clear)

- How many? `[1 / 3 / 5]`
- Style? `[Clean studio / Lifestyle / With a model / Concept / Festive]`
- Where will they be used? `[Shopee or Lazada / Instagram / Facebook ads / Website banner / TikTok Shop]`
- Brand colours or props to include? (only if not obvious)

Without a product photo, ask for one first; images made from a description will not match the real packaging.

## 3. Write each prompt

Start every prompt with: "Use image 1 as the exact product. Keep its shape, colours, label text and logo identical; do not redesign the packaging."
Then describe, in this order: setting and surface, camera angle and lens (for example "45-degree three-quarter view, 85mm"), lighting (for example "soft window light from the left, gentle shadow"), props (2–3, relevant to the product and the Malaysian buyer), colour palette, and the empty space needed for text if the image is for an ad.
For a set, vary angle, setting and lighting between images, never just paraphrase the same scene. For a carousel, lock one palette and lighting style across all slides and say "slide N of M" in each prompt.

## 4. Models

Use the best available image model that accepts reference images (GPT Image Pro, Nano Banana or Seedream class). Use 2k resolution when offered. One image per call keeps each prompt distinct; use count only for near-identical alternatives.

## 5. Deliver

List each image with its use ("Shopee main image", "Instagram post 2 of 4"). Offer: more angles, a festive version, or turning the best shot into a 5-second product video with `generate_video` (image to video, slow push-in, soft light).
