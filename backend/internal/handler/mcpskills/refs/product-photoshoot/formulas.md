# Product photo formulas

Every product prompt is built from labelled blocks in this order. Fill every block; a block you skip is a decision the model makes badly. Write in English, one paragraph per block, no bullet lists inside the prompt. Always pass the product photo as image 1 and open with the fidelity line.

Fidelity line (always first): "Use image 1 as the exact product: same shape, proportions, colours, materials, label text and logo. Do not redesign, recolour or re-letter it."

Finish every prompt with an AVOID block assembled from `vocabulary` (universal list, plus the people list when hands or faces appear, plus the label list when the product has text, plus the stock list for lifestyle, hero and ad images).

## Studio (catalog, Shopee/Lazada main image, packshot)

Pick one look: clean studio (white to light-grey seamless, soft frontal key, small contact shadow), dramatic (one hard rim light, deep shadow, dark backdrop; fragrance, electronics, premium), minimal colour (one pastel seamless, lots of empty space), handmade (linen, wood or stone, warm window light), luxury (polished marble or velvet, jewel-tone backdrop, controlled reflections), bold colour (saturated solid background, colour blocking), floating (product suspended mid-air, accents in motion), ingredient flat-lay (top-down, real ingredients arranged around it).

Blocks: SUBJECT (hero shot of the exact product, its material and finish, label facing camera) · COMPOSITION (camera angle, framing, where it sits on the thirds, how much empty space) · LIGHTING (direction, quality, Kelvin, shadow behaviour) · LENS (focal length, aperture, what is tack-sharp) · MATERIALS (surface treatment, reflections, micro-detail) · PALETTE (2–3 tones that suit the brand, contrast level) · CRAFT (2–3 concrete craft descriptors, for example "graphic still-life, precise geometry, playful shadow") · QUALITY ("tack-sharp, hyper-detailed, commercial-grade") · AVOID.

## Lifestyle (product in a real place)

Malaysian scenes that read as local, not generic Western: a condo kitchen with a rice cooker and a window to the city, a terrace-house dining table, a kopitiam marble table with kopi, a mamak stall at night, an office pantry, a car interior in traffic, a bathroom vanity with a mosaic tile wall, a bedroom with a standing fan and soft curtain light, a gym, a beach in Langkawi, a pasar malam stall, a balcony with potted plants at sunset.

Blocks: SCENE (place and time of day in 1–2 sentences) · PRODUCT PLACEMENT (where it sits, what it is next to, how prominent) · PEOPLE (hands only, a person partly in frame, or "no people, traces of presence such as a half-drunk cup") · ENVIRONMENT (3–5 grounding objects with textures) · LIGHTING (named source, direction, Kelvin, shadows) · LENS (35mm wide environment, 50mm natural, or 85mm intimate; shallow depth for separation) · ATMOSPHERE (one mood word and the air: steam, dust in a light shaft, haze) · PALETTE · CRAFT · QUALITY ("cinematic depth, hyper-realistic textures, natural skin and hands") · AVOID.

## Hands and close-up (beauty, food, gadgets)

Pick one moment: applying serum with a dropper, lipstick on lips, hand holding the bottle upright, cream poured into a palm, texture swatched on the back of a hand, a single drop suspended from a dropper, two hands cradling an open jar, a sip or a bite.

Blocks: FRAMING (tight crop, product fills 40–60% of the frame, name the exact crop: nose to chin, palm, wrist and bottle) · PRODUCT (exact product, sharp focus on it) · PERSON (only the body part in frame, real skin with pores, skin tone that matches the buyer) · INTERACTION (one action, unstaged, ritual feel) · LIGHTING (soft key with a clean catchlight on the product) · LENS (100mm macro or 85mm, f/2.8–f/4, soft skin background) · DETAIL ("natural pores and fine lines, anatomically correct hands with five fingers") · PALETTE · FIDELITY ("the person supports the product; the product is the anchor") · QUALITY · AVOID (add: no face dominating, no plastic skin, no warped fingers).

## Model wearing or using it

Keep the garment or accessory exactly as image 1; describe the person by look, age band and build, never by a real name. Pick an environment (clean studio, outdoor natural, street, home) and a framing (full body, three-quarter, waist up, close on the product area). Body in a relaxed, natural stance with both hands relaxed or one hand engaging the product. Modest styling by default for the Malaysian market; respect hijab when the brief or brand calls for it.

## Hero banner (website, email, shop header)

Wide 16:9 or 21:9. The product is the anchor on one third; the scene extends naturally across the frame. Lighting follows the brand tier: premium uses one directional key and deep falloff; mass-market uses bright, even daylight. Text follows the typography rule in `vocabulary`.

## Carousel (3–6 slides that belong together)

First write a slide outline (what each slide shows and why). Then lock one VISUAL SYSTEM paragraph (palette, surface, light baseline, composition rule, craft descriptors) and paste it word for word at the top of every slide prompt, followed by "Slide N of M:" and that slide's own content. Same ratio for every slide.

## Ad pack (static ads that test different angles)

Lock a VISUAL SYSTEM paragraph as for carousels, with one high-saturation accent colour that stops the scroll. Each variant takes a different angle: problem then solution, transformation (only if true), feature zoom, comparison with the old way, lifestyle aspiration, curiosity, urgency (real offers only), founder or behind-the-scenes, unboxing reveal, bold statement. Per variant: VISUAL SYSTEM (pasted) · VARIANT N: angle, ratio · HOOK VISUAL · COMPOSITION (focal anchor on a third, strong eye path) · LIGHTING tuned to the angle · CONTRAST ("higher saturation and contrast than organic content, it must fight the feed") · TYPOGRAPHY if text is wanted · QUALITY ("scroll-stopping, performance-ad ready") · AVOID. Platform ratios: Facebook/Instagram feed 4:5, square 1:1, Stories/Reels/TikTok 9:16, banner 16:9, Pinterest 2:3.

## Concept (floating, splash, surreal, CGI)

Name the physics in plain words: what floats, what splashes, which direction, frozen at which instant. One dramatic light, a simple backdrop so the idea reads in one glance. Keep the product label legible and unchanged.

## Restyle (same image, new mood or festival)

Two axes: an aesthetic (clean minimal, quiet luxury, cottage, Y2K glossy, Japandi, art deco, retro 90s, pastel dream, bold maximal) and an occasion (Chinese New Year, Hari Raya, Deepavali, Christmas, Merdeka, Mid-Autumn, Valentine's, Mother's Day, 11.11 or 12.12 sale). Prompt: SOURCE ("Restyle image 1. Preserve the product, the composition and the framing.") · TRANSFORM (aesthetic plus occasion) · CUES (props, surfaces and palette of that aesthetic and occasion, see the festive table in /festive-campaign) · LIGHTING for the new mood · PRESERVATION ("only the atmosphere changes; the product stays identical") · AVOID (add: no half-applied style, no change to the product).

## Check every result

Look at each image before showing it: label text identical, no extra or warped fingers, product not duplicated, scale believable, text (if any) spelled exactly. If one area is weak, run one fix pass: an edit of that image with the reference, naming only the problem ("Keep everything identical; fix the label so it reads exactly 'X'"). At most one fix per image unless the user asks.
