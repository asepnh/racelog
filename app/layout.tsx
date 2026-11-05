import type { Metadata } from "next";
import "./globals.css";
import NavTabs from "@/components/NavTabs";

// This app's pages fetch live data from Postgres per request (session
// lists, telemetry); there's no meaningful static shell to prerender, so
// opt the whole app out of Cache Components' instant-navigation
// validation rather than adding Suspense boundaries everywhere.
export const instant = false;

export const metadata: Metadata = {
  title: "RaceLog",
  description: "GPS race telemetry from EdgeTX + a GPS telemetry sensor, reviewed like MoTeC.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <header className="site-header">
          <h1>RaceLog</h1>
          <NavTabs />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
