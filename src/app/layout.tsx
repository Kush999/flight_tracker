import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pearson Flight Intelligence | T1 International Arrivals",
  description: "Tomorrow's scheduled international arrivals at Toronto Pearson Terminal 1.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
