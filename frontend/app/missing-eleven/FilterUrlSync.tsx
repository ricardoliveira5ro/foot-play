'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { filtersToParams, paramsToFilters, FILTER_PARAM_KEYS, LEGACY_FILTER_KEYS } from '@/lib/filterParams';
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

  // 1. read: report the URL's filters. Effects run child-first, so this
  // dispatch happens before the page's own effects in the same commit — but
  // the dispatched state only lands on the next render, which is why the
  // write below stays locked until the read has completed a full commit.
  useEffect(() => {
    onFilters(paramsToFilters(new URLSearchParams(key)));
  }, [key, onFilters]);

  // 2. write: reflect the applied filters, merging over the live query.
  useEffect(() => {
    if (!readyRef.current) return; // never write before the first read
    const next = new URLSearchParams(key);
    for (const k of FILTER_PARAM_KEYS) next.delete(k);
    // Bookmark convergence: keys from removed dimensions must be actively
    // stripped, not left behind as unknown params forever.
    for (const k of LEGACY_FILTER_KEYS) next.delete(k);
    for (const [k, v] of filtersToParams(applied)) next.set(k, v);
    const href = next.size ? `${pathname}?${next}` : pathname;
    if (href === (key ? `${pathname}?${key}` : pathname)) return; // already canonical
    router.replace(href, { scroll: false });
  }, [applied, key, router, pathname]);

  // 3. unlock writes — declared last so it runs after both effects above in
  // the first commit. Setting `readyRef` inside the read effect would let the
  // write effect of that same commit strip the URL before the read dispatch
  // has re-rendered the page; this ordering is what prevents that.
  useEffect(() => {
    readyRef.current = true;
  }, []);

  return null;
}
