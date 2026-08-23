'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Logo from '@/components/Logo';

const NAV_LINKS = [{ href: '/missing-eleven', label: 'Missing Eleven' }] as const;

function isLinkActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile panel whenever navigation happens (e.g. browser back).
  // Adjusting state during render is the React-recommended alternative to
  // syncing state in an effect.
  const [previousPathname, setPreviousPathname] = useState(pathname);
  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    if (menuOpen) {
      setMenuOpen(false);
    }
  }

  return (
    <header className="border-b border-ink/10 bg-paper">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-flare" aria-label="FootPlay home">
          <Logo size={28} variant="icon-only" aria-hidden="true" />
          <span className="font-display text-xl leading-none text-ink">FootPlay</span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isLinkActive(pathname, link.href) ? 'page' : undefined}
                className={`rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-flare ${
                  isLinkActive(pathname, link.href)
                    ? 'text-ink underline decoration-flare decoration-2 underline-offset-4'
                    : 'text-ink/55 hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Mobile hamburger — 44x44 touch target */}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className="-mr-2 flex h-11 w-11 flex-col items-center justify-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare md:hidden"
        >
          <span aria-hidden="true" className="h-0.5 w-6 bg-ink" />
          <span aria-hidden="true" className="h-0.5 w-6 bg-ink" />
          <span aria-hidden="true" className="h-0.5 w-6 bg-ink" />
        </button>
      </nav>

      {/* Mobile panel */}
      {menuOpen && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-b border-ink/10 bg-paper md:hidden">
          <ul className="flex flex-col px-4 py-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isLinkActive(pathname, link.href) ? 'page' : undefined}
                  className={`block rounded-sm px-2 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare ${
                    isLinkActive(pathname, link.href) ? 'text-ink' : 'text-ink/55 hover:text-ink'
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
