import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/render': 'http://localhost:3000',
      '/scrape': 'http://localhost:3000',
      '/extract': 'http://localhost:3000',
      '/process': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/engines': 'http://localhost:3000',
      '/profiles': 'http://localhost:3000',
      '/config': 'http://localhost:3000',
    },
  },
})
