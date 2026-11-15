import assert from "node:assert/strict";
import test from "node:test";

import { formatPoolCredits, formatRM, minimumProgress, ringgitToSen, sslStatusDisplay, topupEstimateMicrocredits, usageAgainstMinimum } from "./agency-format";

test("money is shown as RM with two decimals and thousands separators", () => {
    assert.equal(formatRM(500_000), "RM 5,000.00");
    assert.equal(formatRM(12_345), "RM 123.45");
    assert.equal(formatRM(0), "RM 0.00");
    assert.equal(formatRM(-150), "-RM 1.50");
});

test("credits use thousands separators", () => {
    assert.equal(formatPoolCredits(1_234_567_000_000), "1,234,567");
    assert.equal(formatPoolCredits(1_500_000), "1.5");
});

test("ringgit input converts to sen", () => {
    assert.equal(ringgitToSen(5000), 500_000);
    assert.equal(ringgitToSen(0.1 + 0.2), 30);
    assert.equal(ringgitToSen(-1), 0);
    assert.equal(ringgitToSen(undefined), 0);
});

test("monthly minimum progress and copy", () => {
    assert.equal(minimumProgress(250_000), 50);
    assert.equal(minimumProgress(900_000), 100);
    assert.equal(usageAgainstMinimum(123_456), "本月已用 RM 1,234.56 / 最低消费 RM 5,000.00");
});

test("ssl status tones", () => {
    assert.equal(sslStatusDisplay("active").tone, "success");
    assert.equal(sslStatusDisplay("pending_validation").tone, "warning");
    assert.equal(sslStatusDisplay("validation_timed_out").tone, "error");
});

test("top-up estimate matches RM 0.773 per 100 credits", () => {
    assert.equal(formatPoolCredits(topupEstimateMicrocredits(77_300)), "100,000");
    assert.equal(topupEstimateMicrocredits(0), 0);
});
