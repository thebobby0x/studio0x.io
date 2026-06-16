import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AERO-TRACK | Premium Flight Intelligence",
  description: "Real-time global flight tracking and analysis platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={cn(inter.className, "bg-background text-foreground antialiased overflow-hidden")}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
