import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During local development the frontend runs on a different port than the
// backend, so we proxy all requests under `/api` to whatever the
// `VITE_API_URL` environment variable points at (defaults to
// http://localhost:3001).  This allows the UI to simply fetch
// `/api/...` without having to worry about CORS or explicit host names.
//
// In production the two will be served from the same origin, so no proxy is
// necessary; `VITE_API_URL` can be left blank or point at the deployed API.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
}))
