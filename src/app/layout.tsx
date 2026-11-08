import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'AIGents Voice — Command Center', description: 'Your mortgage voice assistant, calling activity, and business settings in one place.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
