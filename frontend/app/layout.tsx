import type { Metadata } from 'next';
import { Anton, IBM_Plex_Mono, Instrument_Sans } from 'next/font/google';
import Layout from '@/components/Layout';
import './globals.css';

const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-anton',
});

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
});

const plexMono = IBM_Plex_Mono({
  weight: ['500', '600'],
  subsets: ['latin'],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'FootPlay — Football Mini-Games',
  description: 'Play free football mini-games. Guess the legendary starting elevens behind famous matches.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${instrumentSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}
