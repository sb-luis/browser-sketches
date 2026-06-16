import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

const sketchInputs = Object.fromEntries(
  fs.readdirSync('src/sketches', { recursive: true })
    .filter((f) => f.endsWith('index.html'))
    .map((f) => {
      const abs = path.resolve('src/sketches', f);
      const key = path.relative(path.resolve('src'), abs).replace(/[/\\]index\.html$/, '');
      return [key, abs];
    })
);

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve('src/index.html'),
        ...sketchInputs,
      },
    },
  },
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
