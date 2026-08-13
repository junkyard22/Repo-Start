import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { LICENSE_IDS } from '../src/config/types.ts';
import { renderLicense } from '../src/templates/license.ts';

/**
 * Regression cover for the packaging contract, not for npm itself.
 *
 * These assertions are all build independent: they check what the manifest
 * promises and that runtime assets resolve, so they hold in a fresh clone
 * before `npm run build` has ever run. The real proof that the tarball works
 * is `npm pack` followed by an isolated install.
 */

interface Manifest {
  name: string;
  type?: string;
  main?: string;
  bin?: Record<string, string>;
  files?: string[];
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as Manifest;

function repoPath(relative: string): URL {
  return new URL(`../${relative}`, import.meta.url);
}

describe('the published package', () => {
  test('exposes a repo-start executable built from the CLI entry point', () => {
    const binTarget = manifest.bin?.['repo-start'];

    assert.equal(binTarget, 'dist/index.js');
    assert.equal(manifest.main, binTarget);

    // The compiled file does not exist until a build runs, so verify the
    // source it is compiled from instead.
    const source = readFileSync(repoPath('src/index.ts'), 'utf8');

    assert.ok(source.startsWith('#!/usr/bin/env node'), 'the CLI entry point needs a shebang');
  });

  test('ships the directories the executable needs at runtime', () => {
    const files = manifest.files ?? [];

    assert.ok(files.includes('dist'), 'the compiled CLI must be published');
    assert.ok(files.includes('assets'), 'bundled license texts must be published');
  });

  test('builds on prepack, so `npm pack` cannot produce a tarball without dist/', () => {
    const scripts = manifest.scripts ?? {};

    assert.ok(scripts['build'], 'a build script is required');
    assert.match(scripts['prepack'] ?? '', /build/);
  });

  test('has no runtime dependencies', () => {
    assert.deepEqual(manifest.dependencies ?? {}, {});
  });

  test('declares the module system and the Node.js floor it relies on', () => {
    assert.equal(manifest.type, 'module');
    assert.ok(manifest.engines?.['node']);
  });

  test('every license the generator offers resolves from a bundled asset', () => {
    for (const license of LICENSE_IDS) {
      const text = renderLicense(license, 'Test Author', 2026);

      if (license === 'none') {
        assert.equal(text, null);
        continue;
      }

      assert.ok(text && text.length > 500, `${license} should render a full license text`);
    }
  });

  test('the bundled license assets live where the package publishes them', () => {
    assert.ok(existsSync(repoPath('assets/licenses/apache-2.0.txt')));
    assert.ok(existsSync(repoPath('assets/licenses/gpl-3.0.txt')));
  });
});
