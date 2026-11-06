import { useEffect, useState } from 'react';

/**
 * Returns `value`, but updated only after `delayMs` of no further changes.
 * Used on free-text search/filter inputs so every keystroke doesn't trigger
 * a full list re-filter — only the pause after typing does.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
