import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Фронт ходит только на `/api` (config/env.ts: API_BASE_URL по умолчанию '/api'),
      // плюс статика загрузок и документация. Раньше здесь были перечислены префиксы
      // модулей (`/group`, `/students`, `/teacher`, `/quiz`, …) — они остались со
      // времён, когда axios ходил без базового `/api`, и теперь только ломают dev:
      // vite матчит префикс, так что SPA-маршрут `/groups` уходил на бэкенд и отдавал 404.
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/docs': 'http://localhost:8000',
      '/redoc': 'http://localhost:8000',
      '/openapi.json': 'http://localhost:8000',
    },
  },
})
