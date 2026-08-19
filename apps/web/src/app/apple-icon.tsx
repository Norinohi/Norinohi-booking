import { ImageResponse } from "next/og";

/*
 * Generated rather than committed as a binary.
 *
 * iOS ignores `favicon.ico` when a page is added to the home screen and falls back to a
 * screenshot of the page, which for this app is a slab of hero photo with no brand on it. The
 * mark is drawn here from the same brand blue (`--brand-500`, #2f80ed) the UI uses, and matches
 * `public/seo/logo.png` — that one is a file because search engines read it as a plain URL.
 *
 * 180x180 is the size iOS actually asks for; anything smaller gets upscaled and looks soft.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#2f80ed",
        color: "#ffffff",
        fontSize: 104,
        fontWeight: 700,
        letterSpacing: "-0.05em",
      }}
    >
      Y
    </div>,
    size,
  );
}
