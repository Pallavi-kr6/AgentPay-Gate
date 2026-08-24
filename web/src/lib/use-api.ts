"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

interface UseApiOptions {
  pollMs?: number;
}

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = [], options: UseApiOptions = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);

  // Keep the ref current without mutating it during render (React Compiler
  // rules disallow ref writes in the render body) - this effect runs after
  // every render, before the mount/poll effect below since effects run in
  // declaration order.
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      setData(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Standard fetch-on-mount pattern: this effect synchronizes component
    // state with the backend, which is exactly what effects are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (options.pollMs) {
      const id = setInterval(() => load(true), options.pollMs);
      return () => clearInterval(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: () => load(true) };
}
