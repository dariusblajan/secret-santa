import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub Pages serves the site under /secret-santa/, so production builds need that base.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/secret-santa/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
  },
}))
