import NextTopLoader from "nextjs-toploader";
import { Lato, JetBrains_Mono } from "next/font/google";
import LoaderBridge from "@/components/LoaderBridge";
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
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`h-full antialiased ${lato.variable} ${jbMono.variable}`}>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NextTopLoader color="#875A7B" height={3} showSpinner={false} />
        <LoaderBridge />
        {children}
      </body>
    </html>
  );
}
