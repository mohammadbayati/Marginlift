import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { ROUTES, routeMatchesPath } from "./src/entries/route-config";

const root = fileURLToPath(new URL(".", import.meta.url));

const htmlInputs = Object.fromEntries(
  ROUTES.map((route) => [route.id, fileURLToPath(new URL(route.html, import.meta.url))]),
);

function cleanRoutePath(url: string): string {
  const pathname = new URL(url, "http://vite.local").pathname;
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function routeHistoryFallback(): Plugin {
  const rewrite = (url: string | undefined): string | undefined => {
    if (!url) return undefined;

    const pathname = cleanRoutePath(url);
    const route = ROUTES.find((candidate) => routeMatchesPath(candidate, pathname));
    if (!route) return undefined;

    const search = new URL(url, "http://vite.local").search;
    return `/${route.html}${search}`;
  };

  return {
    name: "route-history-fallback",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        request.url = rewrite(request.url) ?? request.url;
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        request.url = rewrite(request.url) ?? request.url;
        next();
      });
    },
  };
}

export default defineConfig({
  root,
  base: "/",
  appType: "mpa",
  plugins: [routeHistoryFallback(), react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    manifest: true,
    target: "es2022",
    rollupOptions: {
      input: htmlInputs,
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
