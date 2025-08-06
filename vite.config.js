import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: ['uuid'], // أضف هذا السطر
    },
  },
  optimizeDeps: {
    include: ['uuid'], // وأضف هذا السطر أيضًا
  }
})
