import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GloSIS ETL Platform",
  description:
    "Soil Data Harmonization, Standardization & Visualization — ISO 28258",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="antialiased bg-zinc-950 text-white">{children}</body>
    </html>
  );
}
