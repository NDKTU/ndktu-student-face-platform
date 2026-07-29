/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Docker'siz lokal ishlashda backend to'g'ridan-to'g'ri :8000 da turadi.
    // Prod'da bu yo'llarni nginx proksi qiladi, shuning uchun ilova ikkala
    // holatda ham bir xil nisbiy `/api` manzilidan foydalanadi.
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
