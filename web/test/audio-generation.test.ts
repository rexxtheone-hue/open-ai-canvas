import { describe, expect, test } from "bun:test";
import { doubaoAudioVoiceOptions, isDoubaoAudioConfig, normalizeAudioVoiceForConfig, normalizeAudioVoiceValue } from "../src/lib/audio-generation";

const config = (protocol: string) =>
    ({
        provider: "custom",
        model: "models/index-tts",
        audioModel: "models/index-tts",
        apiKey: "",
        baseUrl: "",
        channels: [{ models: ["index-tts"], modelCosts: [], interfaceType: protocol, baseUrl: "", apiKey: "" }],
    }) as any;

describe("audio voice protocol handling", () => {
    test("keeps custom voice identifiers for non-OpenAI channels", () => {
        expect(normalizeAudioVoiceValue("voice_001")).toBe("voice_001");
    });

    test("uses provider-specific Doubao defaults instead of OpenAI alloy", () => {
        const doubao = { ...config("doubao-streaming-tts"), model: "seed-audio-1.0", audioModel: "seed-audio-1.0" } as any;
        expect(isDoubaoAudioConfig(doubao)).toBe(true);
        expect(isDoubaoAudioConfig({ ...config("cloudwise-seedaudio"), model: "seed-audio-1.0", audioModel: "seed-audio-1.0" } as any)).toBe(true);
        expect(normalizeAudioVoiceForConfig(doubao, "alloy")).toBe("");
    });

    test("lists only Doubao 2.0 voices, which seed-audio-1.0 accepts", () => {
        const values = doubaoAudioVoiceOptions.map((item) => item.value);
        expect(doubaoAudioVoiceOptions).toHaveLength(80);
        expect(new Set(values).size).toBe(values.length);
        expect(values).toContain("zh_female_vv_uranus_bigtts");
        expect(values).toContain("zh_female_xiaohe_uranus_bigtts");
        expect(values).toContain("ICL_uranus_en_female_charlie_tob");
        expect(values.some((value) => /_(mars|moon)_bigtts$/.test(value))).toBe(false);
        expect(doubaoAudioVoiceOptions.every((item) => /[\u4e00-\u9fff]/.test(item.label) && /[\u4e00-\u9fff]/.test(item.scene))).toBe(true);
    });

    test("preserves manually entered official Doubao speaker IDs", () => {
        const doubao = { ...config("doubao-streaming-tts"), model: "seed-audio-1.0", audioModel: "seed-audio-1.0" } as any;
        expect(normalizeAudioVoiceForConfig(doubao, "zh_male_custom_official_speaker")).toBe("zh_male_custom_official_speaker");
        expect(normalizeAudioVoiceForConfig(doubao, "zh_female_shuangkuaisisi_moon_bigtts")).toBe("");
    });
});
