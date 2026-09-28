/**
 * Build-time constant.
 *
 * Next.js inlines `NEXT_PUBLIC_*` variables into the bundle during `next build`
 * (see node_modules/next/dist/docs/01-app/02-guides/environment-variables.md).
 * Two rules follow from that and must be preserved here:
 *
 * 1. The lookup must be a static member access. A dynamic `process.env[name]`
 *    lookup is deliberately *not* inlined by the bundler.
 * 2. It must never be read at request time, or static generation breaks. The
 *    value is frozen at build time, so a single module-level read is correct.
 *
 * `UNKNOWN` is the shared sentinel: it is the same literal `backend/src/app.ts`
 * uses for an absent `APP_VERSION`, and `docker-compose.prod.yml` defaults
 * `NEXT_PUBLIC_APP_VERSION` to it. So a deploy with no `APP_VERSION` in the
 * environment does not leave the variable unset — it sets it to the string
 * `unknown`. That has to be recognised as "no version known" rather than
 * version-prefixed, otherwise the footer renders `vunknown` in production and
 * a broken version injection looks like a real version.
 */
const UNKNOWN = 'unknown';

const rawVersion = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
// Anything empty, or the sentinel itself, renders as a bare "unknown". Any
// other value is prefixed with `v` for display so that it matches the release
// tag (`v0.2.3`) that the value in package.json corresponds to.
const version = !rawVersion || rawVersion === UNKNOWN ? UNKNOWN : `v${rawVersion}`;

export default function Footer() {
  return (
    <footer className="border-t border-ink/10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-[13px] text-ink/55 md:flex-row md:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <p>© {new Date().getFullYear()} FootPlay</p>
          <p className="text-ink/40">{version}</p>
        </div>
        <ul className="flex items-center gap-6">
          <li>
            <span>About</span>
          </li>
          <li>
            <span>Contact</span>
          </li>
        </ul>
      </div>
    </footer>
  );
}
