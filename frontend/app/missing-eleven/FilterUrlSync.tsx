'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { filtersToParams, paramsToFilters, FILTER_PARAM_KEYS, LEGACY_FILTER_KEYS } from '@/lib/filterParams';
import { hasActiveFilters } from '@/lib/filters';
import type { GameFilterParams } from '@/types';

interface Props {
  applied: GameFilterParams;
  onFilters: (filters: GameFilterParams) => void;
}

/**
 * The app's single reader and writer of the filter query string. Renders null.
 *
 * The `missing-suspense-with-csr-bailout` rule makes an uncased
 * `useSearchParams()` call a `next build` failure ("Entire page /missing-eleven
 * deopted into client-side rendering"), so the page must wrap this component
 * in a `<Suspense>` boundary. Do not remove either.
 */
export default function FilterUrlSync({ applied, onFilters }: Props): null {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // ReadonlyURLSearchParams extends URLSearchParams, so this is structurally
  // sound and needs no cast. Do not add one.
  const key = searchParams.toString();
  const readyRef = useRef(false);
  // The latest URL key, read by the write effect without making the write
  // depend on `key`. See note below.
  const keyRef = useRef(key);
  const readRef = useRef(false);

  // 1. read: report the URL's filters. Effects run child-first, so this
  // dispatch happens before the page's own effects in the same commit — but
  // the dispatched state only lands on the next render, which is why the
  // write below stays locked until the read has completed a full commit.
  useEffect(() => {
    keyRef.current = key;
    const parsed = paramsToFilters(new URLSearchParams(key));
    // First-read guard. Start writes the URL before it flips `started`, but
    // Next commits a client `router.replace` asynchronously: the board (and
    // this component) can mount while `useSearchParams` still reports the
    // *previous* — often empty — URL. Adopting that stale empty URL would wipe
    // the filters Start just applied. A genuine empty deep link parses to
    // EMPTY too, and `applied` is already EMPTY then, so nothing is lost by
    // deferring to the applied set here.
    if (!readRef.current) {
      readRef.current = true;
      if (!hasActiveFilters(parsed) && hasActiveFilters(applied)) return;
    }
    onFilters(parsed);
    // `applied` is read only for the first-read guard; listing it would
    // re-dispatch on every applied change and fight the user's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, onFilters]);

  // 2. write: reflect the applied filters, merging over the live query.
  //
  // This effect must fire on a change in `applied` ONLY — never on a change in
  // `key`. If it also keyed on `key`, then an external URL change (a router
  // navigation, or Start's deferred `router.replace`) would run the write in
  // the same commit as the read, before the read's dispatch has re-rendered
  // the page. The write would then see the *previous* `applied` against the
  // new key and rewrite the URL backwards; the read would bounce it forward
  // again — an infinite navigation loop. Reading the live key from a ref keeps
  // the merge over unrelated params (?daily=) correct without subscribing to
  // URL changes.
  useEffect(() => {
    if (!readyRef.current) return; // never write before the first read
    const currentKey = keyRef.current;
    const next = new URLSearchParams(currentKey);
    for (const k of FILTER_PARAM_KEYS) next.delete(k);
    // Bookmark convergence: keys from removed dimensions must be actively
    // stripped, not left behind as unknown params forever.
    for (const k of LEGACY_FILTER_KEYS) next.delete(k);
    for (const [k, v] of filtersToParams(applied)) next.set(k, v);
    const href = next.size ? `${pathname}?${next}` : pathname;
    if (href === (currentKey ? `${pathname}?${currentKey}` : pathname)) return; // already canonical
    router.replace(href, { scroll: false });
  }, [applied, router, pathname]);

  // 3. unlock writes — declared last so it runs after both effects above in
  // the first commit. Setting `readyRef` inside the read effect would let the
  // write effect of that same commit strip the URL before the read dispatch
  // has re-rendered the page; this ordering is what prevents that.
  useEffect(() => {
    readyRef.current = true;
  }, []);

  return null;
}
