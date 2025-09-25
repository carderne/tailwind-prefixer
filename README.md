# tailwind-prefixer

Vite plugin to add prefixes to your Tailwind classes in your JSX/TSX.

Tailwind provides a way to add a prefix like `yourco:` to all your classes, so you'll have eg `yourco:bg-red-500`.

But you still have to manually use the prefixed version in your code:
```tsx
<div className="yourco:bg-red-500" />
```

This plugin handles that part, and TRIES QUITE HARD<sup>(see below)</sup> to automatically prefix all your React code during the build step.

Note that it _doesn't_ handle the CSS side. You should use [postcss-prefixer](https://www.npmjs.com/package/postcss-prefixer) to handle that. **Not** Tailwind's built-in settings, as that will confuse things.

## Quickstart
Install
```bash
npm install -D tailwind-prefixer postcss-prefixer
```

Use
```tsx
// vite.config.ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tailwindPrefixer } from "tailwind-prefixer";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // ...rest of your config
  plugins: [
    tailwindPrefixer({
      prefix: "foo:",                    // this is where you set your prefix!
      include: ["**/*.tsx"],
      exclude: ["node_modules/**"],
    }),
    tailwindcss(),
    react(),
  ],
}));
```

And PostCSS setup
```typescript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-prefixer": {
      prefix: "foo:",                    // MAKE SURE THIS PREFIX MATCHES!
    },
  },
};

export default config;
```

## How it works
The plugin traverses the AST of your "compiled" code, looking for the following structures:

1. Objects with `className: "literal string"`
2. Calls to `cn(foo === bar ? "literal a" : "literal b")` (very common in shadcn/ui)
3. Calls to `cva("literal", { option: "literal" })`

And it prefixes all classes in found literals with your provided prefix.

Unlike Tailwind itself, which can lean heavily towards false positives (only downside is a few extra classes in the `.css` file), this leans towards false negatives: too much prefixing could change your landing page to `yourco:Our yourco:Great yourco:SaaS!`.
