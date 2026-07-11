import rawData from "./data.json";
import { randomIndex, randomEntry } from "./util";

interface DramaData {
    combinations: Record<string, string[]>;
    sentences: string[];
    social: string[];
}

// Widen the JSON literal so combination keys can be indexed dynamically
// without materializing a 730-line literal type.
const { combinations, sentences, social }: DramaData = rawData;

// This flat shape is the wire format: base64(JSON) permalinks depend on it,
// so existing shared links must keep decoding identically.
interface DramaIds {
    sentence: number;
    [combinationKey: string]: number | number[];
}

function renderDrama(
    message: string,
    share: string,
    sharePath: string,
    teaser: string,
): string {
    return `
<html>
    <head>
        <title>Spigot Drama Generator</title>
        <meta name="description" content="${message}" />
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <meta name="og:title" content="${teaser}"/>
        <meta name="og:type" content="website"/>
        <meta name="og:url" content="${share}"/>
        <meta name="og:site_name" content="Spigot Drama Generator"/>
        <meta name="og:description" content="${message}"/>

        <link rel="icon" href="data:,">
        <style>
            body {
                font-family: sans-serif;
                text-align: center;
            }
            #more:visited {
                color: blue;
            }
        </style>
        <script>
            const konami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
            const inputs = ["", "", "", "", "", "", "", "", "", ""]

            function pushInput(key) {
                inputs.shift();
                inputs.push(key);
            }

            function checkInputs() {
                for (i in inputs) {
                    if (konami[i] != inputs[i]) {
                        return false;
                    }
                }
                return true;
            }

            function onLoad() {
                window.history.replaceState({}, "", "${sharePath}");
            }

            function onKeyDown(e) {
                pushInput(e.key);

                if (checkInputs()) {
                    document.getElementById("fight").innerHTML = "<img src=\\"https://media1.tenor.com/images/747305f3c5cbcb6bce00b9bea17a7978/tenor.gif\\" alt=\\"FIIIIIIGHT!\\"/>"
                }

                if (e.key == "Enter") {
                    window.location = "/";
                }
            }

            window.onload = onLoad;
            window.onkeydown = onKeyDown;
        </script>
    </head>
    <body>
        <h3>Spigot Drama Generator</h3>
        <h1>${message}</h1>
        <span id="fight"></span>
        <h6>
            <a id="more" href="/">Generate more drama!</a> (or press enter)
            <br />
            <br />
            This website is made in jest - don't take it too seriously!
            <br />
            Originally developed by mdcfe; Fork by mja00; PRs welcome on <a href="https://github.com/mja00/spigot-drama-generator">GitHub</a>.
            <br />
            Inspired by (and heavily borrows from) <a href="https://github.com/asiekierka/MinecraftDramaGenerator/">asiekierka's Minecraft Drama Generator</a>.
            <br />
            <a href="/api">Also check out the JSON API!</a>
            <br />
            <i>Unofficial alternative forms: <a href="https://api.chew.pro/spigotdrama">Chew's JSON API</a> | <a href="https://twitter.com/SpigotDrama">Twitter bot</a></i>
            <br />
            <a href="https://syscraft.org/">Long live Syscraft!</a>
            <br />
            <a href="https://paper-chan.moe/discord">Paper-chan is cute!</a>
        </h6>
    </body>
</html>
    `;
}

function generateDramaIds(): DramaIds {
    const drama: DramaIds = { sentence: randomIndex(sentences) };

    for (const [key, options] of Object.entries(combinations)) {
        drama[key] = [
            randomIndex(options),
            randomIndex(options),
            randomIndex(options),
            randomIndex(options),
        ];
    }

    return drama;
}

// Narrows the user-controlled base64 payload; null mirrors the old
// throw-into-catch path, which always answered with a 404.
function parseDramaIds(encoded: string): DramaIds | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(atob(encoded));
    } catch {
        return null;
    }

    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (
        typeof record.sentence !== "number" ||
        sentences[record.sentence] === undefined
    ) {
        return null;
    }
    // Combination id arrays are validated where they're used; permalinks only
    // carry the keys their sentence actually needs.
    return record as DramaIds;
}

function resolveDrama(
    dramaIds: DramaIds,
): { message: string; usedDramaIds: DramaIds } | null {
    const usedDramaIds: DramaIds = { sentence: dramaIds.sentence };
    let message = sentences[dramaIds.sentence];
    if (message === undefined) return null;

    for (const [key, options] of Object.entries(combinations)) {
        const placeholder = `[${key}]`;
        if (!message.includes(placeholder)) continue;

        const ids = dramaIds[key];
        // A payload missing ids its sentence needs threw before; 404 keeps parity.
        if (!Array.isArray(ids)) return null;

        const used: number[] = [];
        usedDramaIds[key] = used;
        for (const id of ids) {
            if (!message.includes(placeholder)) continue;
            if (typeof id !== "number") return null;
            used.push(id);

            // Out-of-range ids have always rendered the literal string
            // "undefined"; keep that so old crafted links don't change.
            message = message.replace(placeholder, String(options[id]));
        }
    }

    return { message, usedDramaIds };
}

function handleRoot(url: URL): Response {
    const dramaUrl = btoa(JSON.stringify(generateDramaIds()));
    const host = url.host == "example.com" ? "localhost:8787" : url.host;

    return handleDrama(new URL(`${url.protocol}//${host}/${dramaUrl}`));
}

function handleDrama(url: URL): Response {
    const dramaIds = parseDramaIds(url.pathname.split("/")[1] ?? "");
    if (dramaIds === null) return handle404();

    const resolved = resolveDrama(dramaIds);
    if (resolved === null) return handle404();

    url.pathname = "/" + btoa(JSON.stringify(resolved.usedDramaIds));

    const teaser = randomEntry(social);

    return new Response(
        renderDrama(resolved.message, url.href, url.pathname, teaser),
        {
            headers: {
                "content-type": "text/html;charset=utf8",
            },
        },
    );
}

function handleJsonDrama(url: URL): Response {
    // Bare /api has no payload yet, so generate one and re-enter as a permalink
    if (url.pathname == "/api") {
        const dramaUrl = btoa(JSON.stringify(generateDramaIds()));
        const host = url.host == "example.com" ? "localhost:8787" : url.host;
        return handleJsonDrama(
            new URL(`${url.protocol}//${host}/api/${dramaUrl}`),
        );
    }

    const dramaIds = parseDramaIds(url.pathname.split("/api/")[1] ?? "");
    if (dramaIds === null) return handle404();

    const resolved = resolveDrama(dramaIds);
    if (resolved === null) return handle404();

    const optimizedUrl = new URL(url.href);
    optimizedUrl.pathname =
        "/api/" + btoa(JSON.stringify(resolved.usedDramaIds));

    return new Response(
        JSON.stringify({
            response: resolved.message,
            permalink: optimizedUrl.href,
        }),
    );
}

function handle404(): Response {
    return new Response("no u", {
        status: 404,
    });
}

export default {
    fetch(request): Response {
        const url = new URL(request.url);
        if (url.pathname == "/") {
            return handleRoot(url);
        } else if (url.pathname == "/favicon.ico") {
            return handle404();
        } else if (url.pathname.startsWith("/api")) {
            return handleJsonDrama(url);
        } else {
            return handleDrama(url);
        }
    },
} satisfies ExportedHandler<Env>;
