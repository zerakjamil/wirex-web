import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "wireX - Interactive Network Topology Lab",
  description: "Browser-native network simulation workbench with CLI, topology canvas, and packet inspection.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "wireX",
  },
};

export const viewport: Viewport = {
  themeColor: "#4338ca",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-slate-950 text-slate-100 antialiased">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="h-full w-full overflow-hidden flex flex-col">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (${process.env.NODE_ENV === 'production'} && 'serviceWorker' in navigator && window.location.protocol.startsWith('http') && !navigator.userAgent.includes('Electron')) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
