import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');
const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;
const HEADING_PATTERN = /^##\s+(v\S+)\s*(?:[\u2013\u2014-]\s*(.*))?$/;
const SEPARATOR_PATTERN = /^-{3,}\s*$/;

interface ChangelogSection {
  version: string;
  title: string;
  body: string;
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function tryGit(args: string[]): string | null {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function fail(message: string): never {
  console.error(`[release] ERROR: ${message}`);
  process.exit(1);
}

function warn(message: string): void {
  console.warn(`[release] WARNING: ${message}`);
}

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) fail(`${name} requires a value.`);
  return value;
}

function positionalVersion(): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) return args[i];
    if (args[i] === '--notes' || args[i] === '--title') i++;
  }
  return undefined;
}

function stripEdges(body: string): string {
  const lines = body.trim().split('\n');
  while (lines.length > 0 && (lines[0].trim() === '' || SEPARATOR_PATTERN.test(lines[0]))) {
    lines.shift();
  }
  while (
    lines.length > 0 &&
    (lines[lines.length - 1].trim() === '' || SEPARATOR_PATTERN.test(lines[lines.length - 1]))
  ) {
    lines.pop();
  }
  return lines.join('\n');
}

function parseChangelog(): ChangelogSection[] {
  const lines = readFileSync(CHANGELOG_PATH, 'utf8').split('\n');
  const sections: ChangelogSection[] = [];
  let current: { version: string; title: string; start: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_PATTERN);
    if (!match) continue;
    if (current) {
      sections.push({ ...current, body: stripEdges(lines.slice(current.start, i).join('\n')) });
    }
    current = { version: match[1], title: (match[2] ?? '').trim(), start: i + 1 };
  }
  if (current) {
    sections.push({ ...current, body: stripEdges(lines.slice(current.start).join('\n')) });
  }
  return sections;
}

function findSection(version: string): ChangelogSection {
  if (!VERSION_PATTERN.test(version)) {
    fail(`"${version}" is not a valid version. Expected vMAJOR.MINOR.PATCH, e.g. v0.2.3`);
  }
  const sections = parseChangelog();
  const matches = sections.filter((section) => section.version === version);
  if (matches.length === 0) {
    const available = sections.map((section) => section.version).join(', ');
    fail(`CHANGELOG.md has no "## ${version}" section. Available: ${available || '(none)'}`);
  }
  if (matches.length > 1) {
    fail(`CHANGELOG.md has ${matches.length} "## ${version}" sections. Expected exactly one.`);
  }
  return matches[0];
}

function releaseTitle(section: ChangelogSection): string {
  return section.title ? `${section.version} — ${section.title}` : section.version;
}

function findExistingTag(version: string): string | null {
  if (tryGit(['tag', '--list', version])) return 'a local tag';
  const remote = tryGit(['ls-remote', '--tags', 'origin', `refs/tags/${version}`]);
  if (remote === null) {
    warn('Could not reach origin; remote tag check skipped.');
    return null;
  }
  return remote ? 'a tag on origin' : null;
}

function validate(): ChangelogSection {
  const dirty = git(['status', '--porcelain', '--untracked-files=no']);
  if (dirty) {
    fail(
      `Tracked files have uncommitted changes:\n${dirty}\n` +
        'Commit or stash them before releasing — the tag must match a committed changelog.',
    );
  }

  const sections = parseChangelog();
  if (sections.length === 0) fail('No "## vX.Y.Z" release sections found in CHANGELOG.md.');

  const requested = positionalVersion();
  const version = requested ?? sections[0].version;
  const section = findSection(version);

  if (requested && version !== sections[0].version) {
    fail(
      `CHANGELOG.md lists a newer release on top: ${sections[0].version}.\n` +
        `Move your "## ${version}" section above it, or release ${sections[0].version} instead.`,
    );
  }

  const existing = findExistingTag(version);
  if (existing) fail(`${version} already exists as ${existing}. Choose a new version.`);

  const local = tryGit(['rev-parse', 'HEAD']);
  const remote = tryGit(['rev-parse', 'origin/main']);
  if (local === null) fail('Could not resolve HEAD.');
  if (remote === null) {
    warn('Could not resolve origin/main; skipping the up-to-date check.');
  } else if (local !== remote) {
    fail(
      `HEAD (${local.slice(0, 7)}) is not origin/main (${remote.slice(0, 7)}).\n` +
        'Push your commits first — a release must point at a pushed commit.',
    );
  }

  return section;
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function runRelease(): Promise<void> {
  const section = validate();
  const version = section.version;
  const title = releaseTitle(section);
  const lineCount = section.body.split('\n').length;

  console.log('[release] Release plan\n');
  console.log(`  version   ${version}`);
  console.log(`  title     ${title}`);
  console.log(`  commit    ${git(['rev-parse', '--short', 'HEAD'])}`);
  console.log(`  notes     ${lineCount} lines from CHANGELOG.md`);

  if (process.argv.includes('--dry-run')) {
    console.log('\n[release] --dry-run: validation passed, no changes made.');
    return;
  }

  if (!process.argv.includes('--yes')) {
    const answer = await confirm(`\n[release] Create and push tag ${version}?`);
    if (!answer) {
      console.log('[release] Aborted. No changes made.');
      return;
    }
  }

  git(['tag', '-a', version, '-m', title]);
  console.log(`\n[release] Created tag ${version}.`);

  try {
    git(['push', 'origin', `refs/tags/${version}`]);
  } catch {
    fail(
      `Tag ${version} was created but the push failed.\n` +
        `Recover with: git push origin refs/tags/${version}`,
    );
  }
  console.log(
    '[release] Pushed tag. Releases are published automatically when a PR merges into main.\n' +
      '  A manually pushed tag does not auto-publish; create the release with:\n' +
      `  gh release create ${version} --target <sha> --title "${title}" --notes-file <notes.md>`,
  );
}

async function main(): Promise<void> {
  const notesVersion = flagValue('--notes');
  if (notesVersion) {
    process.stdout.write(`${findSection(notesVersion).body}\n`);
    return;
  }
  const titleVersion = flagValue('--title');
  if (titleVersion) {
    process.stdout.write(`${releaseTitle(findSection(titleVersion))}\n`);
    return;
  }
  const nextVersion = process.argv.includes('--next');
  if (nextVersion) {
    const sections = parseChangelog();
    for (const section of sections) {
      if (!findExistingTag(section.version)) {
        process.stdout.write(`${section.version}\n`);
        return;
      }
    }
    return;
  }
  await runRelease();
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
