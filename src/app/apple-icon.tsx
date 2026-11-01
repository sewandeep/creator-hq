import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iPhone home-screen icon.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#6d28d9",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 50px",
          gap: 18,
        }}
      >
        <div style={{ height: 14, width: 80, background: "white", borderRadius: 7 }} />
        <div style={{ height: 14, width: 54, background: "white", borderRadius: 7 }} />
        <div style={{ height: 14, width: 68, background: "white", borderRadius: 7 }} />
      </div>
    ),
    size,
  );
}
