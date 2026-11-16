import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.tagline,
  // Private app for young players: ask search engines not to index it.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0d1411",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-AU"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-pitch text-chalk font-sans">
        {children}
      </body>
    </html>
  );
}
