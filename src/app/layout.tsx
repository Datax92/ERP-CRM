import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from 'next/script';
import "./globals.css";
import "./property-ui.css";
import "./erp-ui.css";
import { DataProvider } from "@/components/DataProvider";
import { AppShell } from "@/components/AppShell";
import { AppearanceProvider } from '@/context/AppearanceContext';
import { EARLY_APPLY_SCRIPT } from '@/lib/appearance';

// Display serif for titles and headline figures, a crisp grotesk for the interface,
// and a mono for document numbers and labels.
const body = Inter({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Trade ERP",
  description: "Clients, RFQs, quotations, orders, deliveries, payments and reporting.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: '#1F2456',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="signature" data-icons="classic" suppressHydrationWarning className={`${body.variable} h-full`}>
      <body className="min-h-full">
        <AppearanceProvider><DataProvider><AppShell>{children}</AppShell></DataProvider></AppearanceProvider>
        <Script id="saved-look" strategy="beforeInteractive">{EARLY_APPLY_SCRIPT}</Script>
      </body>
    </html>
  );
}
