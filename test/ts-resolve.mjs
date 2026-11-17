// Lets node --test import TypeScript sources that use extensionless relative imports.
import { registerHooks } from 'node:module';
import fs from 'node:fs';
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.[cm]?[jt]s$/.test(spec)) {
      const u = new URL(spec + '.ts', ctx.parentURL);
      if (fs.existsSync(u)) return next(u.href, ctx);
    }
    return next(spec, ctx);
  },
});
