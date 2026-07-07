import "./globals.css";

export const metadata = {
  title: "Vibe Theory Studio — Cinematic Creative Director AD Studio",
  description: "AI-powered cinematic commercial script generator and video timeline editor.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
