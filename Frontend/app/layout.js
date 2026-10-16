import NextTopLoader from "nextjs-toploader";
import { Lato, JetBrains_Mono } from "next/font/google";
import LoaderBridge from "@/components/LoaderBridge";
import BrandingIcons from "@/components/BrandingIcons";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-lato",
  display: "swap",
});

const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jb-mono",
  display: "swap",
});

export const metadata = {
  title: "Effee Portal",
  description: "Effee Portal — service ticketing",
  // Installable web-app manifest, generated dynamically so its icon reflects the
  // uploaded company logo (see app/manifest.webmanifest/route.js).
  manifest: "/manifest.webmanifest",
  // In the initial HTML (not only added by script), so "Create shortcut" /
  // install over plain http still finds the logo. Square, see app/app-icon.svg.
  icons: { icon: [{ url: "/app-icon.svg", type: "image/svg+xml" }] },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`h-full antialiased ${lato.variable} ${jbMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets data-theme before React loads, so a dark theme never flashes white. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NextTopLoader color="#875A7B" height={3} showSpinner={false} />
        <LoaderBridge />
        <BrandingIcons />
        {children}
      </body>
    </html>
  );
}
