import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CUSTOM_CHECKER_WORKER_SOURCE } from '../custom-checker-worker-source.generated';

// The generated source module must stay byte-identical to the real worker. Bun's
// `--compile` static analyzer cannot discover the worker from
// `new Worker(new URL('./custom-checker-worker.ts', import.meta.url))`, so the worker is
// inlined as a string by `scripts/generate-checker-worker-source.ts` and spawned from a
// blob URL inside compiled binaries. Without this guard, editing the worker without
// regenerating would silently ship a stale worker in every compiled binary — a failure
// mode that is invisible in dev and only appears in production.
describe('custom checker worker source generation', () => {
  it('matches custom-checker-worker.ts exactly', () => {
    const workerPath = path.join(import.meta.dirname, '..', 'custom-checker-worker.ts');
    const actual = readFileSync(workerPath, 'utf8');
    expect(CUSTOM_CHECKER_WORKER_SOURCE).toBe(actual);
  });

  it('inlines a worker that registers an onmessage handler', () => {
    expect(CUSTOM_CHECKER_WORKER_SOURCE).toContain('self.onmessage');
  });
});
