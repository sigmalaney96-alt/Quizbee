import type { Metadata } from "next";
import { SessionProvider } from "@/components/session";
import { Header } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quizbee | Little moments, big learning",
  description: "Interactive video quizzes for Google Classroom.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SessionProvider><Header />{children}</SessionProvider></body></html>;
}
