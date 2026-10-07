import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFilterOptions } from '../../lib/api';
import { filtersToParams } from '@/lib/filterParams';
import type { FilterOptionsResponse, GameFilterParams } from '@/types';

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.';
}

export interface UseFilterOptionsReturn {
  options: FilterOptionsResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useFilterOptions(filters: GameFilterParams): UseFilterOptionsReturn {
  const [options, setOptions] = useState<FilterOptionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const seqRef = useRef(0);

  const key = filtersToParams(filters).toString(); // canonical serialisation

  useEffect(() => {
    const seq = ++seqRef.current;
    // Mark the request in-flight synchronously so `loading` is true from the
    // first commit; deferring to a microtask would flash a stale idle frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetchFilterOptions(filters)
      .then((next) => {
        if (seq === seqRef.current) {
          setOptions(next);
        }
      })
      .catch((cause: unknown) => {
        if (seq === seqRef.current) {
          setError(describeError(cause));
        }
      })
      .finally(() => {
        if (seq === seqRef.current) {
          setLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]); // `key` (derived from `filters`) is the stable identity; `filters` is captured in closure

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { options, loading, error, reload };
}
