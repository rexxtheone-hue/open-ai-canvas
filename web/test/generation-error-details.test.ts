import { describe, expect, test } from "bun:test";
import { CONTENT_MODERATION_MESSAGE, generationErrorMessage, generationFailureMetadata } from "../src/lib/generation-error";

describe("safe upstream error details", () => {
    const detail = "非常抱歉，生成的图片可能违反了关于裸露、色情或情色内容的防护限制。请重试或修改提示语。";
    test("keeps the specific image rejection on the card", () => {
        const message = `模型服务拒绝了请求，请检查模型和参数；上游：${detail}`;
        expect(generationErrorMessage(new Error(message))).toBe(message);
    });
    test("does not replace a safe upstream message with a generic HTTP hint", () => {
        const message = `模型服务暂时不可用（HTTP 500）；上游：${detail}`;
        expect(generationErrorMessage(message)).toBe(message);
        expect(generationErrorMessage("模型服务暂时不可用（HTTP 500）")).toBe("网络异常。");
    });
    test("keeps details when moderation metadata is stored", () => {
        const message = `内容审核未通过；上游：${detail}`;
        const metadata = generationFailureMetadata(message, "test prompt");
        expect(metadata.errorDetails).toBe(`${CONTENT_MODERATION_MESSAGE}；上游：${detail}`);
        expect(metadata.generationErrorCode).toBe("sensitive_words_detected");
    });
    test("upstream marker does not bypass URL hiding", () => {
        expect(generationErrorMessage("模型服务请求失败；上游：https://private.test")).toBe("网络异常。");
    });
});

describe("provider failure reasons", () => {
    const providerError = (message: string) => Object.assign(new Error(message), { reason: "provider_request_failed" });
    test("shows the backend's specific provider reason instead of the generic one", () => {
        expect(generationErrorMessage(providerError("模型服务额度不足，请检查渠道余额或配额"))).toBe("模型服务额度不足，请检查渠道余额或配额");
        expect(generationErrorMessage(providerError("模型服务鉴权失败，请检查 API Key 和模型权限"))).toBe("模型服务鉴权失败，请检查 API Key 和模型权限");
    });
    test("keeps the generic text for fallback or technical provider messages", () => {
        expect(generationErrorMessage(providerError("模型服务返回失败，请检查请求内容或渠道配置"))).toBe("模型服务处理失败，请稍后重试或换用其他模型。");
        expect(generationErrorMessage(providerError("upstream_error: bad things happened upstream"))).toBe("模型服务处理失败，请稍后重试或换用其他模型。");
    });
    test("recognizes quota failures in English provider text", () => {
        expect(generationErrorMessage(providerError("You exceeded your current quota, please check your plan and billing details."))).toBe("模型服务额度不足，请检查渠道余额或配额。");
        expect(generationErrorMessage("insufficient_quota: account has no remaining balance")).toBe("模型服务额度不足，请检查渠道余额或配额。");
    });
});
