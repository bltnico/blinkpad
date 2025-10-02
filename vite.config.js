// vite.config.js
import { defineConfig } from "vite";

function redirectScopePlugin() {
  const middleware = (req, res, next) => {
    try {
      const url = new URL(req.url, "http://localhost");
      path = url.pathname;

      // ignore assets and Vite internals
      if (
        path === "/" ||
        path.startsWith("/@") || // internals Vite
        path.startsWith("/vite") || // HMR
        path.startsWith("/node_modules") ||
        path.includes(".") || // files .js .css ...
        url.searchParams.has("s") // prevent redirect loop
      ) {
        return next();
      }

      const m = path.match(/^\/([^/]+)$/);
      if (m) {
        const scope = m[1];
        res.statusCode = 301;
        res.setHeader("Location", `/?s=${encodeURIComponent(scope)}`);
        res.end();
        return;
      }
    } catch (_) {}
    next();
  };

  return {
    name: "redirect-scope",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [redirectScopePlugin()],
});
