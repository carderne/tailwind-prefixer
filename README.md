# tailwind-prefixer

Vite plugin to add prefixes to your Tailwind classes in your JSX/TSX.

Available [here on NPM](https://www.npmjs.com/package/tailwind-prefixer).

## Quickstart
Install
```bash
npm install -D tailwind-prefixer
```

Use
```typescript
// vite.config.ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tailwindPrefixer } from "tailwind-prefixer";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // ...rest of your config
  plugins: [
    tailwindPrefixer({
      prefix: "foo:",
      include: ["**/*.tsx"],
      exclude: ["node_modules/**"],
    }),
    tailwindcss(),
    react(),
  ],
}));
```
