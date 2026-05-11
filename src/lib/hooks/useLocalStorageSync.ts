import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";

function useLocalStorageSync<T extends string | boolean>(
  key: string,
  value: T,
  setValue: Dispatch<SetStateAction<T>>,
  opts?: { parse?: (raw: string) => T; serialize?: (v: T) => string },
) {
  const parse = opts?.parse ?? ((raw: string) => raw as unknown as T);
  const serialize = opts?.serialize;
  const stableSerialize = useCallback((v: T) => (serialize ? serialize(v) : String(v)), [serialize]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setValue(parse(stored));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, stableSerialize(value));
    } catch {
      /* ignore */
    }
  }, [key, value, stableSerialize]);
}

const BOOL_PARSE = (raw: string) => raw === "true";
const BOOL_SERIALIZE = (v: boolean) => String(v);

export function useLocalStorageBooleanSync(
  key: string,
  value: boolean,
  setValue: Dispatch<SetStateAction<boolean>>,
) {
  useLocalStorageSync(key, value, setValue, {
    parse: BOOL_PARSE,
    serialize: BOOL_SERIALIZE,
  });
}
