import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    proxy: {
      '/geo': {
        target: process.env.VITE_GEO_API_URL ?? 'http://localhost:4100',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/geo/, ''),
      },
    },
  },
})
