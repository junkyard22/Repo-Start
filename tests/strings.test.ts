import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { slugify, toPythonModule } from '../src/utils/strings.ts';

/**
 * These helpers are small and pure, and both of them trim a character class
 * from both ends. That trimming used to be `/^[-._]+|[-._]+$/`, whose trailing
 * half is the shape static analysis flags as polynomial: in principle the
 * engine retries from every start position. V8 optimises the anchored scan, so
 * it was never actually slow, and these tests make no timing claim. They pin
 * the behaviour instead, which is what the rewrite to an index walk had to
 * preserve.
 */

describe('slugify', () => {
  test('lowercases, replaces runs of other characters, and collapses them', () => {
    assert.equal(slugify('My Project!'), 'my-project');
    assert.equal(slugify('  Spaced   Out  '), 'spaced-out');
    assert.equal(slugify('Already-Fine'), 'already-fine');
  });

  test('trims separators from both ends', () => {
    assert.equal(slugify('---leading'), 'leading');
    assert.equal(slugify('trailing---'), 'trailing');
    assert.equal(slugify('...dots...'), 'dots');
    assert.equal(slugify('-._mixed_.-'), 'mixed');
  });

  test('keeps separators that are not at an end', () => {
    assert.equal(slugify('a.b_c-d'), 'a.b_c-d');
  });

  test('falls back to a usable name when nothing survives', () => {
    assert.equal(slugify(''), 'app');
    assert.equal(slugify('---'), 'app');
    assert.equal(slugify('...'), 'app');
    assert.equal(slugify('!!!'), 'app');
  });

  test('handles a long run of separators without pathological behaviour', () => {
    // Not a timing assertion: this only has to terminate and be correct.
    assert.equal(slugify(`${'.'.repeat(100_000)}x`), 'x');
    assert.equal(slugify(`${'-'.repeat(100_000)}x`), 'x');
  });
});

describe('toPythonModule', () => {
  test('produces an importable module name', () => {
    assert.equal(toPythonModule('my-project'), 'my_project');
    assert.equal(toPythonModule('My.Mixed-Case'), 'my_mixed_case');
  });

  test('prefixes names that would not be valid identifiers', () => {
    assert.equal(toPythonModule('3d-tools'), 'pkg_3d_tools');
    assert.equal(toPythonModule('class'), 'pkg_class');
    assert.equal(toPythonModule('lambda'), 'pkg_lambda');
  });

  test('trims underscores from both ends', () => {
    assert.equal(toPythonModule('---edges---'), 'edges');
    assert.equal(toPythonModule('___'), 'app');
  });
});
