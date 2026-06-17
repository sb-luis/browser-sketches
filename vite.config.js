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

function sketchManifestPlugin() {
  const virtualId = 'virtual:sketch-manifest'
  const resolvedId = '\0' + virtualId

  const sketches = Object.keys(sketchInputs).flatMap((key) => {
    const m = key.match(/sketches\/(\d{4})\/(m(\d+)-d(\d+)-([^/]+))/)
    if (!m) return []
    const [, year, folder, month, day, slug] = m
    const label = slug.replace(/-/g, ' ')
    const date = new Date(Number(year), Number(month) - 1, Number(day))
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    return [{ year, folder, label, date, url: `/${key}/index.html` }]
  })

  return {
    name: 'sketch-manifest',
    resolveId(id) { if (id === virtualId) return resolvedId },
    load(id) {
      if (id === resolvedId) return `export default ${JSON.stringify(sketches)}`
    },
  }
}

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    assetsDir: 'sketches/assets',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve('src/index.html'),
        ...sketchInputs,
      },
    },
  },
  plugins: [tailwindcss(), sketchManifestPlugin()],
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
