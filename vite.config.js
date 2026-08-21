import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

// Provides `virtual:bookshelf-data`: null during dev (app uses the API),
// the full book list from SQLite during build, with locally cached covers
// inlined as data URIs so the built file works standalone.
function bookshelfData() {
  const virtualId = 'virtual:bookshelf-data'
  const resolvedId = '\0' + virtualId
  let isBuild = false

  return {
    name: 'bookshelf-data',
    config(_, env) {
      isBuild = env.command === 'build'
    },
    resolveId(id) {
      if (id === virtualId) return resolvedId
    },
    async load(id) {
      if (id !== resolvedId) return
      if (!isBuild) return 'export default null'

      const { getAllBooks } = await import('./server/db.js')
      const books = (await getAllBooks()).map(book => {
        if (book.coverUrl) return book
        const coverPath = path.join(ROOT, 'public', 'covers', `${book.id}.jpg`)
        if (!fs.existsSync(coverPath)) return book
        const data = fs.readFileSync(coverPath).toString('base64')
        return { ...book, coverUrl: `data:image/jpeg;base64,${data}` }
      })
      return `export default ${JSON.stringify(books)}`
    }
  }
}

export default defineConfig({
  plugins: [bookshelfData(), viteSingleFile()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    outDir: 'dist',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  test: {
    environment: 'happy-dom',
  },
})
