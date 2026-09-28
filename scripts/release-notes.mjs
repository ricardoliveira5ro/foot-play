#!/usr/bin/env node
/**
 * Extract one version's section from CHANGELOG.md, for use as a GitHub Release
 * body. This is a guard as much as a formatter: it exits non-zero rather than
 * emit a missing, partial or empty body, so a release workflow can treat the
 * exit status as a hard gate.
 *
 * Usage:
 *   node scripts/release-notes.mjs v0.2.3               # body of the v0.2.3 section
 *   node scripts/release-notes.mjs 0.2.3                # same; the `v` is optional
 *   node scripts/release-notes.mjs v0.2.3 --print-title # just the heading's title
 *
 * Heading grammar, read off the real file rather than assumed:
 *
 *   ## v0.2.3 — Precision XI Scoring System
 *   ^^ ^^^^^^ ^ ^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^
 *   |   |      | |         |
 *   |   |      | |         human-written title, reused as the release title
 *   |   |      | |
 *   |   |      | separator: space + EM DASH (U+2014) + space
 *   |   |      trailing space is optional, so a bare `## v0.2.3` also matches
 *   |   bare SemVer, and the `v` prefix is part of the heading
 *   ATX heading, level 1-6
 *
 * A version is matched only against such a heading, and only on whole-version
 * equality. That matters in this file: `v0.2.4` is mentioned in prose ("open
 * scope in v0.2.4") with no heading, and `v0.1.5` is mentioned in prose 55
 * lines *before* its own heading. A substring or first-mention search would
 * return the wrong section in both cases.
 *
 * Dependency-free by design, matching scripts/set-version.mjs: node:fs only.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const CHANGELOG = join(REPO_ROOT, 'CHANGELOG.md');

/**
 * SemVer, with the prerelease and build fields deliberately omitted.
 *
 * set-version.mjs accepts `-rc.1` and `+build`; this does not, and that is
 * intentional. The project has never cut a prerelease, a prerelease GitHub
 * Release is a different product decision (it needs `--prerelease`, and its
 * "latest" semantics), and the release workflow applies the same strict rule
 * to the tag. One definition of "a releasable version", enforced in two
 * places, so the two can never disagree. Shipping v0.3.0-rc.1 later means
 * deliberately widening both this and the tag guard in release.yml — a visible
 * edit, not an accident.
 *
 * Leading zeros are rejected by the `0|[1-9]\d*` alternation, per the SemVer 2.0.0
 * spec, so `v01.2.3` cannot be tagged.
 */
const RELEASABLE = '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)';

/** Accepted CLI input: `v0.2.3` or `0.2.3`, nothing looser. */
const INPUT = new RegExp(`^v?(${RELEASABLE})$`);

/**
 * A version heading, as it appears in the file. Captures: hash level, bare
 * version, title.
 *
 * The version group is a full SemVer including an optional prerelease, even
 * though INPUT rejects prereleases. That asymmetry is on purpose: such a
 * heading must still be recognised as a *section boundary*, so that if a
 * prerelease section is ever added above the current one, the section below it
 * stops at the right place instead of silently swallowing the newer release's
 * notes.
 */
const HEADING = new RegExp(
  `^(#{1,6})[ \\t]+v(${RELEASABLE}(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)` +
    `(?:[ \\t]*[\\u2014\\u2013-][ \\t]*(.*?))?[ \\t]*$`,
);

/** `_Spec: docs/... · 2026-09-11_` — italics wrapping the provenance line. */
const METADATA = /^_.*_$/;

/** A thematic break: `---`, `***` or `___`. */
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;

const isBlank = (line) => line.trim() === '';

/** Locate every version heading in the file, in document order. */
const findHeadings = (lines) =>
  lines
    .map((line, index) => {
      const match = HEADING.exec(line);
      if (!match) return null;
      return {
        level: match[1].length,
        version: match[2],
        title: (match[3] ?? '').trim(),
        index,
      };
    })
    .filter(Boolean);

/**
 * The body is the section's own content: the `### Added / Changed / Fixed`
 * subsections, verbatim.
 *
 * Two pieces of the raw section are dropped, and only these two:
 *
 *  1. The `## v0.2.3 — Title` heading. The release page already renders the
 *     release title above the body, so repeating the version as a second-level
 *     heading is visible duplication. The title text is not lost: the workflow
 *     passes it to `gh release create --title`, via `--print-title`, so the
 *     release is titled "v0.2.3 — Precision XI Scoring System" from the same
 *     source of truth rather than a bare "v0.2.3".
 *
 *  2. The `_Spec: ... · date_` metadata line. It reads as provenance when you
 *     are browsing the repo, but on a release page it is an inline-code span
 *     around a repo-relative path — not a link, and not resolvable from the
 *     release URL. It would render as a line of monospace text that goes
 *     nowhere. It stays in the changelog, which is read in the repo.
 *
 * What is left is byte-identical to the corresponding region of CHANGELOG.md:
 * no generated prose to drift out of sync with the file, and nothing to
 * re-derive if the changelog is edited.
 *
 * The section-terminating `---` is trimmed as well; it delimits the *next*
 * section and would otherwise render as a stray horizontal rule at the bottom
 * of the release body.
 */
const extractBody = (lines, headings, match) => {
  const next = headings.find(
    (heading) => heading.index > match.index && heading.level <= match.level,
  );
  const end = next ? next.index : lines.length;

  let body = lines.slice(match.index + 1, end);

  // Drop the metadata line wherever it sits among the leading blank lines.
  // Only ever the first non-blank line, and only if it is the italics wrapper.
  let cursor = 0;
  while (cursor < body.length && isBlank(body[cursor])) cursor += 1;
  if (cursor < body.length && METADATA.test(body[cursor].trim())) {
    body = [...body.slice(0, cursor), ...body.slice(cursor + 1)];
  }

  // Trim the edges: leading blanks, trailing blanks, trailing `---`.
  let start = 0;
  let stop = body.length;
  while (start < stop && isBlank(body[start])) start += 1;
  while (stop > start && isBlank(body[stop - 1])) stop -= 1;
  if (stop > start && RULE.test(body[stop - 1].trim())) {
    stop -= 1;
    while (stop > start && isBlank(body[stop - 1])) stop -= 1;
  }

  return body.slice(start, stop);
};

const fail = (message) => {
  console.error(`error: ${message}`);
  // Exit code, not process.exit(): Node can truncate a pending stdout write
  // when it exits mid-flush, and this script's whole job is writing a body
  // that must arrive intact. Draining the stream before exiting costs nothing.
  process.exitCode = 1;
};

const usage = [
  'usage: node scripts/release-notes.mjs <version> [--print-title]',
  '  <version>       MAJOR.MINOR.PATCH, with or without the `v` prefix',
  '  --print-title   print the section heading\'s title instead of the body',
].join('\n');

const args = process.argv.slice(2);
const printTitle = args.includes('--print-title');
const positional = args.filter((arg) => arg !== '--print-title');

if (positional.length !== 1) {
  console.error(usage);
  process.exitCode = 1;
} else {
  const requested = positional[0];
  const match = INPUT.exec(requested);

  if (!match) {
    fail(
      `"${requested}" is not a releasable version. Expected MAJOR.MINOR.PATCH ` +
        'with an optional `v` prefix, with no prerelease or build suffix ' +
        '(see the RELEASABLE comment in this script).',
    );
  } else if (!existsSync(CHANGELOG)) {
    fail(`no CHANGELOG.md at ${CHANGELOG}; the release body has no source.`);
  } else {
    // Split on CRLF as well as LF. A leftover \r would leave the heading regex
    // unmatched, which fails closed but with a misleading "no heading" error;
    // the file is LF today, yet the changelog is hand-edited on any platform.
    const lines = readFileSync(CHANGELOG, 'utf8').split(/\r?\n/);
    const headings = findHeadings(lines);
    const version = match[1];
    const sections = headings.filter((heading) => heading.version === version);

    if (sections.length === 0) {
      // The guard. A missing section must never become an empty release body.
      //
      // The prose hint must not be a substring test. `includes('0.2.3')` also
      // matches inside `v0.2.30`, so asking for a section that does not exist
      // yet would be blamed on prose because some *other* version happens to
      // contain this one as a prefix. Require a non-digit, non-dot boundary on
      // the left and a non-digit on the right. This only picks which of two
      // error messages is shown; both fail the release.
      const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const mention = new RegExp(`(?:^|[^0-9.])${escaped}(?![0-9])`);
      const prose = lines.some((line) => !HEADING.test(line) && mention.test(line));
      fail(
        `CHANGELOG.md has no "## v${version}" heading.` +
          (prose
            ? ` The version appears in prose only, which is not a section.`
            : ` Available sections: ${headings.map((h) => `v${h.version}`).join(', ') || 'none'}.`) +
          ` Refusing to publish an empty release body.`,
      );
    } else if (sections.length > 1) {
      // Two headings for one version means two candidate bodies, and picking
      // the first would ship whichever one happened to be higher in the file.
      fail(
        `CHANGELOG.md has ${sections.length} "## v${version}" headings ` +
          `(lines ${sections.map((s) => s.index + 1).join(', ')}). ` +
          'Merge them into one section before tagging.',
      );
    } else if (printTitle) {
      process.stdout.write(`${sections[0].title}\n`);
    } else {
      const body = extractBody(lines, headings, sections[0]);

      if (body.length === 0) {
        fail(
          `the "## v${version}" section is empty. Refusing to publish an empty ` +
            'release body; write the changelog entry before tagging.',
        );
      } else {
        process.stdout.write(`${body.join('\n')}\n`);
      }
    }
  }
}
