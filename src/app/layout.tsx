import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThreeStage } from "@/three/ThreeStage";

export const metadata: Metadata = {
  title: "Game Hub",
  description: "Der Spieleabend für deine Crew – Werwolf, Quiz, Gartic & mehr.",
};

export const viewport: Viewport = {
  themeColor: "#0e0e10",
  width: "device-width",
  initialScale: 1,
};

const themeInit = `
try {
  const t = localStorage.getItem("gh-theme");
  if (t === "light") document.documentElement.classList.remove("dark");
  else document.documentElement.classList.add("dark");
} catch {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <link
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800&f[]=satoshi@400,500,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThreeStage />
        <div className="ui-layer">{children}</div>
      </body>
    </html>
  );
}
