import api from './api';

export type ClientLogLevel = 'warn' | 'error';
export type ClientLogSource = 'console' | 'window.onerror' | 'unhandledrejection' | 'error-boundary';

export interface ClientLogEntry {
    level: ClientLogLevel;
    message: string;
    stack?: string;
    url?: string;
    user_agent?: string;
    source?: ClientLogSource;
    component_stack?: string;
    extra?: Record<string, unknown>;
    timestamp?: string;
}

export const logService = {
    reportClientLogs: async (entries: ClientLogEntry[]): Promise<void> => {
        await api.post('/logs/client', { entries });
    },
};
