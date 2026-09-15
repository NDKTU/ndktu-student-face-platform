import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isAxiosError } from 'axios'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import './i18n'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * 4xx qayta so'ralmaydi.
 *
 * React Query sukut bo'yicha har bir muvaffaqiyatsiz so'rovni yana uch marta
 * takrorlaydi. Tarmoq uzilishi yoki 502 uchun bu to'g'ri, lekin mijoz xatosi
 * o'z-o'zidan tuzalmaydi: `/attendance/me` talaba bo'lmagan hisobga 404
 * qaytaradi va bitta sahifa ochilishida to'rtta bir xil so'rov ketardi.
 * 408 (timeout) va 429 (juda ko'p so'rov) bundan mustasno — ular vaqtinchalik.
 */
const retry = (failureCount: number, error: unknown) => {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        return false;
    }
    return failureCount < 3;
};

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry },
        // Mutatsiyalar sukut bo'yicha takrorlanmaydi; bu yerda faqat
        // aniqlik uchun yozilgan, kelajakda o'zgarib qolmasligi uchun.
        mutations: { retry: false },
    },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
