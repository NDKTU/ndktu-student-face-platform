import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/utils/logger';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        try {
            logger._reportUncaught({
                level: 'error',
                message: error.message,
                stack: error.stack,
                component_stack: info.componentStack ?? undefined,
                url: window.location.href,
                user_agent: navigator.userAgent,
                source: 'error-boundary',
                timestamp: new Date().toISOString(),
            });
        } catch {
            // Logging must never prevent the fallback UI below from rendering.
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-screen flex-col items-center justify-center gap-4">
                    <p className="text-lg font-medium">Nimadir xato ketdi. Sahifani yangilang.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
                    >
                        Yangilash
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
