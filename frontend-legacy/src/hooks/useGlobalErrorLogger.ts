import { useEffect } from 'react';
import { logger } from '@/utils/logger';

export function useGlobalErrorLogger() {
    useEffect(() => {
        const onError = (event: ErrorEvent) => {
            logger._reportUncaught({
                level: 'error',
                message: event.message,
                stack: event.error?.stack,
                url: window.location.href,
                user_agent: navigator.userAgent,
                source: 'window.onerror',
                timestamp: new Date().toISOString(),
            });
        };

        const onRejection = (event: PromiseRejectionEvent) => {
            const reason = event.reason;
            logger._reportUncaught({
                level: 'error',
                message: reason instanceof Error ? reason.message : String(reason),
                stack: reason instanceof Error ? reason.stack : undefined,
                url: window.location.href,
                user_agent: navigator.userAgent,
                source: 'unhandledrejection',
                timestamp: new Date().toISOString(),
            });
        };

        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);

        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);
}
