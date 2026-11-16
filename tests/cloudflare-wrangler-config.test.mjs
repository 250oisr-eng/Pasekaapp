import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(
  readFileSync(new URL('../cloudflare/wrangler.jsonc', import.meta.url), 'utf8')
);

// Keep the production and preview AI bindings aligned with the same Worker binding name.
test('Cloudflare Worker AI binding is configured for deploy and preview', () => {
  assert.equal(config.ai?.binding, 'AI');
  assert.equal(config.previews?.ai?.binding, 'AI');
});
