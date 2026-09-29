import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";
import { AppShell } from "@/components/AppShell";

// Display serif for titles and headline figures, a crisp grotesk for the interface,
// and a mono for document numbers and labels.
const display = Newsreader({ variable: "--font-display-serif", subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"] });
const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Trade ERP",
  description: "Clients, RFQs, quotations, orders, deliveries, payments and reporting.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f2a23" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1814" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} h-full`}>
      <body className="min-h-full">
        <DataProvider>
          <AppShell>{children}</AppShell>
        </DataProvider>
      </body>
    </html>
  );
}
