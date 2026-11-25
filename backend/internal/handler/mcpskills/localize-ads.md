---
name: localize-ads
title: Localize ads
summary: Adapt an ad into Mandarin, Malay, English or another market, with the text, speech and cultural details changed
use_when: translate the ad, Malay version, Chinese version, English version, another country, localize, Bahasa Malaysia, Indonesia or Singapore or Thailand market
argument: the ad (image or video) and the target languages or markets
---

# Localize ads

Make market-ready versions of an ad, not word-for-word translations.

## 1. Questions

- Target languages or markets? `[Malay (Malaysia) / Mandarin (Malaysia) / English / Indonesian / Thai / Other]`, more than one allowed.
- Keep the same people and setting, or adapt them to the market? `[Keep / Adapt]`
- For prices: keep RM, or convert to the local currency? (only if a price appears)

## 2. Write the copy

For each language write natural ad copy a local would use, not a literal translation: Malaysian Malay (not Indonesian), Malaysian Mandarin wording, local slang only if the original has a casual tone. Keep the meaning, offer and call to action. Show the original and each version in a small table before generating.

## 3. Generate

- Image ad: image model with text rendering. "Recreate image 1 exactly (same product, layout, colours, fonts and visuals) but replace the text with: headline "[text]", sub-line "[text]", button "[text]". No other changes." If adapting the market, also describe the changed model or setting.
- Video ad with speech: if the user has new voice-over audio, use `operation: lip_sync` with the original video and the audio. Otherwise regenerate the video with the same references and the same shot list, with the new spoken lines quoted in the prompt and the language named ("speaks Malaysian Malay").
- Video without speech but with on-screen text: use `operation: inpaint` with the video first and the exact replacement text.

## 4. Deliver

Label each result with its language and market. Remind the user to have a native speaker glance at the text before spending on ads.
