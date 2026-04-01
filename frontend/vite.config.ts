import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Group Trip Planner',
        short_name: 'TripPlanner',
        description: 'Plan group trips with friends',
        theme_color: '#4F46E5',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/dashboard',
        scope: '/',
        categories: ['travel', 'productivity'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/api\/trips\/[^/]+\/weather/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'weather-cache', expiration: { maxAgeSeconds: 10800 } },
          },
          {
            urlPattern: /\/api\/trips/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'trips-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/auth': 'http://localhost:8787',
      '/itineraries': 'http://localhost:8787',
      '/expenses': 'http://localhost:8787',
      '/day-notes': 'http://localhost:8787',
      '/users': 'http://localhost:8787',
      '/currency': 'http://localhost:8787',
      '/ai': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
      // These prefixes overlap with frontend routes — only proxy fetch/XHR, not browser navigations
      '/trips': {
        target: 'http://localhost:8787',
        bypass: (req) => {
          if (req.headers.accept?.includes('text/html')) return '/index.html';
        },
      },
      '/invites': {
        target: 'http://localhost:8787',
        bypass: (req) => {
          if (req.headers.accept?.includes('text/html')) return '/index.html';
        },
      },
    },
  },
});
