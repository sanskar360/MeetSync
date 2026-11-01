import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * MeetSync Vite Configuration
 * 
 * DEVELOPMENT:
 * - Runs dev server on port 5173.
 * - Proxies `/api` requests to FastAPI backend running at `http://localhost:8000`.
 * 
 * PRODUCTION DEPLOYMENT WITH FASTAPI:
 * 1. Run `npm run build` inside `frontend/` (outputs to `frontend/dist`).
 * 2. Mount the static directory in FastAPI using Starlette / FastAPI StaticFiles:
 * 
 *    ```python
 *    from fastapi import FastAPI
 *    from fastapi.staticfiles import StaticFiles
 *    from fastapi.responses import FileResponse
 *    import os
 * 
 *    app = FastAPI()
 * 
 *    # 1. API routers registered first under /api
 *    app.include_router(auth_router, prefix="/api/auth")
 *    app.include_router(meetings_router, prefix="/api/meetings")
 * 
 *    # 2. Mount compiled assets folder
 *    app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")
 * 
 *    # 3. SPA catch-all fallback handler for React Router HTML5 pushState:
 *    @app.get("/{full_path:path}")
 *    async def spa_fallback(full_path: str):
 *        file_path = os.path.join("frontend/dist", full_path)
 *        if os.path.exists(file_path) and os.path.isfile(file_path):
 *            return FileResponse(file_path)
 *        return FileResponse("frontend/dist/index.html")
 *    ```
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor';
          }
          if (id.includes('node_modules/@tanstack')) {
            return 'tanstack';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'lucide';
          }
        },
      },
    },
  },
});
