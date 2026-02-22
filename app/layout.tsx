import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppearanceProvider } from "@/context/AppearanceContext";
import GlobalVisualLayer from "@/components/GlobalVisualLayer";
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
  title: "CASSIAN.AI — Understand Any Codebase Instantly",
  description:
    "AI-powered codebase analysis. Upload a GitHub repo or ZIP file and get instant explanations, summaries, and answers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline script to set theme class before first paint — prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("cassian-theme");if(t==="light"){document.documentElement.classList.add("light")}else{document.documentElement.classList.add("dark")}}catch(e){document.documentElement.classList.add("dark")}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-background text-foreground antialiased`}
      >
        <AuthProvider>
          <ThemeProvider>
            <AppearanceProvider>
              {/* Global visual effects — lightweight scanlines only */}
              <GlobalVisualLayer />
              {/* Page content renders above the global layer */}
              <div className="relative z-10">{children}</div>
            </AppearanceProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
