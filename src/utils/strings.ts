/** Small string helpers shared by validation and the templates. */

/**
 * Turn a display name into an npm/directory friendly slug.
 * "My Project!" -> "my-project"
 */
export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');

  return slug.length > 0 ? slug : 'app';
}

/**
 * Turn a slug into an importable Python module name.
 * "my-project" -> "my_project", "3d-tools" -> "pkg_3d_tools"
 */
export function toPythonModule(slug: string): string {
  let name = slug.replace(/[^a-zA-Z0-9]+/g, '_').replace(/_{2,}/g, '_');
  name = name.replace(/^_+|_+$/g, '');

  if (name.length === 0) {
    return 'app';
  }
  if (/^[0-9]/.test(name)) {
    return `pkg_${name}`;
  }
  return name.toLowerCase();
}

/** Join non-empty document sections with exactly one blank line between them. */
export function joinSections(sections: Array<string | null | undefined>): string {
  const body = sections
    .filter((section): section is string => Boolean(section && section.trim()))
    .map((section) => section.trim())
    .join('\n\n');

  return `${body}\n`;
}

/** Render shell lines as a fenced bash block. */
export function bashBlock(lines: string[]): string {
  return ['```bash', ...lines, '```'].join('\n');
}

/** Escape a value for safe inclusion inside a double quoted TOML/JSON string. */
export function escapeQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Collapse whitespace and strip characters that would break a one-line field. */
export function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
