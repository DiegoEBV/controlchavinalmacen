import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import topLevelAwait from "vite-plugin-top-level-await";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        topLevelAwait({
            promiseExportName: "__tla",
            promiseImportName: i => `__tla_${i}`
        }),
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            includeAssets: ['icono.png'],
            manifest: {
                name: 'Control Obras',
                short_name: 'Control',
                description: 'Gestión de Control de Obras',
                theme_color: '#ffffff',
                icons: [
                    {
                        src: 'icono.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'icono.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                cleanupOutdatedCaches: true,
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'gstatic-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    }
                ]
            }
        })
    ],
    server: {
        proxy: {
            '/api-decolecta': {
                target: 'https://api.decolecta.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api-decolecta/, ''),
            },
        },
    },
    build: {
        target: 'es2020',
        cssTarget: 'chrome61',
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-ui': ['bootstrap', 'react-bootstrap', 'react-icons'],
                    'vendor-charts': ['recharts'],
                    'vendor-supabase': ['@supabase/supabase-js'],
                    'vendor-exceljs': ['exceljs'],
                    'vendor-xlsx': ['xlsx'],
                    'vendor-pdf': ['jspdf', 'jspdf-autotable'],
                    'vendor-canvas': ['html2canvas'],
                    'vendor-utils': ['file-saver']
                }
            }
        }
    }
})
