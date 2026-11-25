---
name: static-ads
title: Static ad pack
summary: A set of image ads from your product, offer and customer insights, each with a different angle and headline
use_when: static ads, image ads, Facebook or Instagram ad images, ad creatives, ad pack, banner ads, headline variants, ads from customer reviews or feedback, promo poster
argument: the product, the offer and who it is for
---

# Static ad pack

Make 3–6 image ads that each test a different reason to buy, with the headline built into the image.

## 1. Gather the brief (ask only what is missing)

- Product image (required) and logo (optional).
- Offer? `[Discount / Free gift / Bundle / Free shipping / No offer]` and the exact text, for example "RM39 only, 2 for RM70".
- Audience in one line (for example "working mums in Klang Valley").
- Language of the text? `[Mandarin / Malay / English / Bilingual]`
- Customer reviews or feedback, if they have any: these make the best headlines.

## 2. Plan the angles

Pick different angles: main benefit, pain point, social proof or review quote (real ones only), offer or urgency, comparison (old way vs product), lifestyle aspiration. For each ad write: angle, headline (max 7 words, or 12 Chinese characters), optional sub-line, call to action, layout.
Show the plan as a short table with the total price.

## 3. Generate

Use an image model that renders text well (GPT Image class first, then Nano Banana). Ratio 4:5 for feed (or 1:1, 9:16 for stories if asked). Prompt each ad:
"Facebook ad image, 4:5. Use image 1 as the exact product, unchanged. Layout: [product position], [background]. Headline text exactly: "[headline]" in bold sans-serif at the top. Sub-line: "[text]". Button-style label: "[CTA]". Brand colours [colours]. Clean, high contrast, readable on a phone, no other text."
Quote every piece of text exactly, including RM prices and Chinese or Malay characters. After generation, check the text in each result; if a word is wrong, regenerate that one with the text repeated in the prompt.

## 4. Deliver

Show the ads with their angle labels. Offer: resize to all placements (`/resize-ads`), translated versions (`/localize-ads`), or turning the strongest ad into a short video.
