import { ImageResponse } from "next/og";

export const alt = "Audience Asks. What do your viewers keep asking for? Paste any channel and get the answer from its comments.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The same tokens as globals.css.
const INK = "#0a0d15";
const RAISED = "#161922";
const MUTED = "#a2a7b8";
const SOFT = "#c8ccd6";
const ACCENT = "#0463fd";
const ACCENT_TEXT = "#67a1ff";

// Satori leaves a wide gap after any word with "uT" in it, so "YouTube" only goes where nothing follows it.
const CHIPS = ["Most-asked first", "Real quotes as proof", "Ideas checked on YouTube"];

/**
 * Satoshi from Fontshare, the same files the site loads. Its license doesn't allow committing the font
 * files, so the build fetches them. If that fails, the image uses the default font rather than failing the build.
 */
async function satoshi(weight: 500 | 700) {
  try {
    const css = await (await fetch(`https://api.fontshare.com/v2/css?f[]=satoshi@${weight}&display=swap`)).text();
    const src = css.match(/url\('([^']+\.ttf)'\) format\('truetype'\)/)?.[1];
    if (!src) throw new Error("no TrueType file in the Fontshare CSS");
    const res = await fetch(src.startsWith("//") ? `https:${src}` : src);
    if (!res.ok) throw new Error(`Fontshare answered ${res.status}`);
    return { name: "Satoshi", data: await res.arrayBuffer(), weight, style: "normal" as const };
  } catch (e) {
    console.warn(`opengraph-image: couldn't load Satoshi ${weight}, so the default font is used.`, e);
    return undefined;
  }
}

export default async function OpengraphImage() {
  const fonts = (await Promise.all([satoshi(500), satoshi(700)])).filter((f) => f !== undefined);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: INK,
          backgroundImage: `radial-gradient(70% 110% at 50% 0%, ${ACCENT}55 0%, ${ACCENT}00 70%)`,
          color: "#f7f7f7",
          fontFamily: "Satoshi",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 18, backgroundColor: ACCENT }}>
            <svg width="38" height="38" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round">
              <path d="M4 4h12v9H9l-4 3v-3H4z" />
            </svg>
          </div>
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -0.4 }}>Audience Asks</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 48, fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.7 }}>
          <div>What do your viewers</div>
          <div>keep asking for?</div>
        </div>

        <div style={{ marginTop: 28, fontSize: 32, fontWeight: 500, color: MUTED }}>Paste any channel and get the answer from its comments.</div>

        <div style={{ display: "flex", gap: 16, marginTop: 48 }}>
          {CHIPS.map((chip) => (
            <div key={chip} style={{ display: "flex", padding: 2, borderRadius: 9999, backgroundImage: "linear-gradient(180deg, #3a3d4a, #2d2f3900 55%, #262935)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, height: 52, padding: "0 24px", borderRadius: 9999, backgroundColor: RAISED, fontSize: 23, fontWeight: 500, color: SOFT }}>
                <div style={{ width: 9, height: 9, borderRadius: 9999, backgroundColor: ACCENT_TEXT }} />
                {chip}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
