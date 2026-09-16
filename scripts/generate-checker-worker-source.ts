// Regenerates packages/backend/src/services/quota/custom-checker-worker-source.generated.ts
// from the real worker at custom-checker-worker.ts.
//
// Why this exists: the checker worker must be embedded in `bun build --compile`
// binaries, but Bun's static analyzer cannot discover a worker spawned via
// `new Worker(new URL('./custom-checker-worker.ts', import.meta.url))`, and its
// documented workaround (listing the worker as a build entrypoint) is broken on
// Bun 1.4.0. Import attributes (`with { type: 'text' }`) embed correctly in a
// compiled binary but break Vitest, which resolves the attribute import as a
// normal module import and fails with "Missing 'default' export".
//
// Emitting the worker source as a plain exported string sidesteps both: it is an
// ordinary TypeScript module, so dev, Vitest, and compiled binaries all resolve it
// identically.
//
// Run: bun run generate:checker-worker-source
// A guard test (custom-checker-worker-source.test.ts) fails if this drifts.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');
const workerPath = path.join(root, 'packages/backend/src/services/quota/custom-checker-worker.ts');
const generatedPath = path.join(
  root,
  'packages/backend/src/services/quota/custom-checker-worker-source.generated.ts'
);

const source = readFileSync(workerPath, 'utf8');

const output = `// AUTO-GENERATED — do not edit by hand.
// Source: \`custom-checker-worker.ts\` (same directory).
// Regenerate: \`bun run generate:checker-worker-source\`
//
// The worker is inlined as a string so it survives \`bun build --compile\`; see
// scripts/generate-checker-worker-source.ts for the full rationale.
/* eslint-disable */
export const CUSTOM_CHECKER_WORKER_SOURCE = ${JSON.stringify(source)};
`;

writeFileSync(generatedPath, output);
console.log(`Wrote ${path.relative(root, generatedPath)} (${source.length} chars)`);
