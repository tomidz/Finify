import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmProvider } from "@/hooks/use-confirm";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Finify",
  description: "Personal finance tracker",
  icons: {
    icon: "/finify-icon.png",
    shortcut: "/finify-icon.png",
    apple: "/finify-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-svh bg-background text-foreground antialiased`}
      >
        <ThemeProvider>
          <QueryProvider>
            <TooltipProvider>
              <ConfirmProvider>{children}</ConfirmProvider>
            </TooltipProvider>
          </QueryProvider>
          <Toaster closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
