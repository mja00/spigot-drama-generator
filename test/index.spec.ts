import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import data from "../src/data.json";

// Tests fetch via https://example.com, which trips the worker's
// example.com -> localhost:8787 host rewrite; assert pathnames, not hosts.
const BASE = "https://example.com";

interface ApiDrama {
    response: string;
    permalink: string;
}

function extractH1(html: string): string {
    const match = /<h1>(.*?)<\/h1>/s.exec(html);
    expect(match).not.toBeNull();
    return match![1]!;
}

function extractSharePath(html: string): string {
    const match = /replaceState\(\{\}, "", "(\/[^"]*)"\)/.exec(html);
    expect(match).not.toBeNull();
    return match![1]!;
}

describe("GET /", () => {
    it("renders a drama page", async () => {
        const response = await SELF.fetch(`${BASE}/`);

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toMatch(/^text\/html/);

        const html = await response.text();
        expect(html).toContain("<h3>Spigot Drama Generator</h3>");
        expect(extractH1(html).length).toBeGreaterThan(0);
    });

    it("embeds a permalink that reproduces the same drama", async () => {
        const first = await SELF.fetch(`${BASE}/`);
        const firstHtml = await first.text();
        const sharePath = extractSharePath(firstHtml);

        const decoded: unknown = JSON.parse(atob(sharePath.slice(1)));
        expect(decoded).toBeTypeOf("object");
        const ids = decoded as Record<string, unknown>;
        expect(ids.sentence).toBeTypeOf("number");
        for (const [key, value] of Object.entries(ids)) {
            if (key === "sentence") continue;
            expect(Array.isArray(value)).toBe(true);
            for (const id of value as unknown[]) {
                expect(id).toBeTypeOf("number");
            }
        }

        const second = await SELF.fetch(`${BASE}${sharePath}`);
        expect(second.status).toBe(200);
        expect(extractH1(await second.text())).toBe(extractH1(firstHtml));
    });
});

describe("GET /api", () => {
    it("returns a drama message with a permalink", async () => {
        const response = await SELF.fetch(`${BASE}/api`);

        expect(response.status).toBe(200);
        const body = await response.json<ApiDrama>();
        expect(body.response).toBeTypeOf("string");
        expect(body.response.length).toBeGreaterThan(0);
        expect(body.permalink).toBeTypeOf("string");
    });

    it("permalink reproduces the exact same message", async () => {
        const first = await SELF.fetch(`${BASE}/api`);
        const firstBody = await first.json<ApiDrama>();

        const permalinkPath = new URL(firstBody.permalink).pathname;
        const second = await SELF.fetch(`${BASE}${permalinkPath}`);
        expect(second.status).toBe(200);
        const secondBody = await second.json<ApiDrama>();

        expect(secondBody.response).toBe(firstBody.response);
    });
});

describe("permalink decoding", () => {
    // Regression net for the substitution refactor: a fixed payload must
    // render the exact message the old JS produced for the same ids.
    it("substitutes placeholders deterministically", async () => {
        // sentences[0] uses [people] and [things] exactly once each
        const sentence = data.sentences[0]!;
        expect(sentence).toContain("[people]");
        expect(sentence).toContain("[things]");

        const payload = {
            sentence: 0,
            people: [1, 2, 3, 0],
            things: [2, 3, 4, 5],
        };
        const expected = sentence
            .replace("[people]", data.combinations.people[1]!)
            .replace("[things]", data.combinations.things[2]!);

        const encoded = btoa(JSON.stringify(payload));
        const response = await SELF.fetch(`${BASE}/api/${encoded}`);
        expect(response.status).toBe(200);
        const body = await response.json<ApiDrama>();

        expect(body.response).toBe(expected);
        // the permalink should only keep the ids that were actually consumed
        const optimized = JSON.parse(
            atob(new URL(body.permalink).pathname.slice("/api/".length)),
        ) as Record<string, unknown>;
        expect(optimized).toEqual({ sentence: 0, people: [1], things: [2] });
    });
});

describe("404 handling", () => {
    it("returns 404 for /favicon.ico", async () => {
        const response = await SELF.fetch(`${BASE}/favicon.ico`);
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("no u");
    });

    it("returns 404 for garbage permalinks", async () => {
        const response = await SELF.fetch(`${BASE}/not-valid-base64!!!`);
        expect(response.status).toBe(404);
    });
});
