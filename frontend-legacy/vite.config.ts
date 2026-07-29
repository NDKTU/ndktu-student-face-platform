import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  // O'tish davrida bu ilova asosiy frontend ostidagi /legacy/ da xizmat
  // qiladi. 4-bosqichda butun katalog bilan birga o'chiriladi.
  base: '/legacy/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Forward all backend routes to the backend container / local backend
      '/user': 'http://localhost:8000',
      '/role': 'http://localhost:8000',
      '/permission': 'http://localhost:8000',
      '/faculty': 'http://localhost:8000',
      '/kafedra': 'http://localhost:8000',
      '/group': 'http://localhost:8000',
      '/teacher': 'http://localhost:8000',
      '/question': 'http://localhost:8000',
      '/quiz': 'http://localhost:8000',
      '/quiz_process': 'http://localhost:8000',
      '/result': 'http://localhost:8000',
      '/statistics': 'http://localhost:8000',
      '/students': 'http://localhost:8000',
      '/subject': 'http://localhost:8000',
      '/hemis': 'http://localhost:8000',
      '/user_answers': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
      '/docs': 'http://localhost:8000',
      '/redoc': 'http://localhost:8000',
      '/openapi.json': 'http://localhost:8000',
    },
  },
})
