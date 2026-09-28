#!/usr/bin/env node
/**
 * Single source of truth for the FootPlay version.
 *
 * The root package.json is authoritative. Every workspace package.json must
 * carry the identical version string so that a release tag (`v0.2.3`) can be
 * validated against the code.
 *
 * Usage:
 *   node scripts/set-version.mjs            # report the version + agreement
 *   node scripts/set-version.mjs --check     # same, non-zero exit on drift
 *   node scripts/set-version.mjs 0.2.3       # set root + propagate to workspaces
 *
 * Exactly zero or one argument is accepted. `set-version.mjs --check extra`
 * is rejected rather than silently running the check, because a caller who
 * thinks they are setting a version would get a passing check instead.
 *
 * The version is stored in SemVer form with no `v` prefix. The `v` prefix
 * belongs on the git tag only, so `0.2.3` in package.json pairs with the tag
 * `v0.2.3`.
 *
 * Dependency-free by design: Node's `fs` module only, no shelling out.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const ROOT_MANIFEST = join(REPO_ROOT, 'package.json');

/** Workspace manifests that must mirror the root version. */
const WORKSPACES = ['frontend', 'backend', 'scripts'];

/**
 * The official SemVer 2.0.0 grammar, anchored. Deliberately does not allow a
 * leading `v`: the prefix is a property of the git tag, not of the manifest.
 */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const JSON_INDENT = 2;

const readManifest = (file) => JSON.parse(readFileSync(file, 'utf8'));

/**
 * Rewrites only the `version` key, leaving every other key and the original
 * key order untouched. `JSON.parse`/`JSON.stringify` round-trips insertion
 * order for the non-numeric string keys used in these manifests, and the
 * trailing newline keeps the files diff-clean.
 */
const writeVersion = (file, version) => {
  const manifest = readManifest(file);
  const changed = manifest.version !== version;

  if (changed) {
    manifest.version = version;
    writeFileSync(file, `${JSON.stringify(manifest, null, JSON_INDENT)}\n`, 'utf8');
  }

  return changed;
};

const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

const report = (version, drifted) => {
  console.log(`version: ${version}`);
  console.log(`workspaces: ${WORKSPACES.length} checked`);

  drifted.forEach(({ workspace, found }) => {
    console.log(`  MISMATCH ${workspace}: ${found} (expected ${version})`);
  });

  if (drifted.length > 0) {
    console.error('version check FAILED: workspace versions drifted from root');
    return 1;
  }

  console.log('version check OK: all workspaces agree with root');
  return 0;
};

const check = () => {
  const root = readManifest(ROOT_MANIFEST);
  const version = root.version;

  if (typeof version !== 'string' || !SEMVER.test(version)) {
    fail(`root package.json version "${version}" is not a valid SemVer string`);
  }

  const drifted = WORKSPACES.map((workspace) => ({
    workspace,
    found: readManifest(join(REPO_ROOT, workspace, 'package.json')).version,
  })).filter(({ found }) => found !== version);

  process.exit(report(version, drifted));
};

const set = (version) => {
  if (!SEMVER.test(version)) {
    fail(
      `"${version}" is not a valid SemVer version. Pass MAJOR.MINOR.PATCH with an ` +
        'optional -prerelease and +build, and no `v` prefix (the tag carries the prefix).',
    );
  }

  const rootChanged = writeVersion(ROOT_MANIFEST, version);
  console.log(`${rootChanged ? 'updated' : 'unchanged'} package.json -> ${version}`);

  WORKSPACES.forEach((workspace) => {
    const file = join(REPO_ROOT, workspace, 'package.json');
    const changed = writeVersion(file, version);
    console.log(`${changed ? 'updated' : 'unchanged'} ${workspace}/package.json -> ${version}`);
  });

  process.exit(report(version, []));
};

const [argument, ...extra] = process.argv.slice(2);

if (extra.length > 0) {
  const listed = extra.map((a) => `"${a}"`).join(', ');
  fail(
    `unexpected extra argument${extra.length > 1 ? 's' : ''}: ${listed}. ` +
      'This script takes at most one argument: the version to set, or --check.',
  );
}

if (argument === undefined || argument === '--check' || argument === '-c') {
  check();
} else {
  set(argument);
}
