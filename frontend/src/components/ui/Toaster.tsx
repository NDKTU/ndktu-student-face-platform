import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '@/context/ThemeContext';

/** App-wide toast outlet. Use `toast.success/error/info` from 'sonner' anywhere. */
export const Toaster = () => {
    const { theme } = useTheme();
    return (
        <SonnerToaster
            theme={theme}
            position="top-right"
            richColors
            closeButton
            toastOptions={{
                style: { fontFamily: 'var(--font-sans)' },
            }}
        />
    );
};
