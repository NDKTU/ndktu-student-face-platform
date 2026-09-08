import { useEffect, useState } from 'react';

/**
 * Qiymatni kechiktirib qaytaradi — server bo'yicha qidiruv uchun.
 *
 * Har bosilgan harf so'rov yubormasin: 650 guruh yoki 2935 fan ichidan
 * qidirilganda bu sekundiga o'nlab so'rov degani.
 */
export const useDebouncedValue = <T,>(value: T, delay = 300): T => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
};
