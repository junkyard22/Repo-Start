/**
 * Line ending normalization.
 *
 * Without this, a repository shared between Windows and Unix contributors
 * accumulates CRLF and LF versions of the same file and every diff turns into
 * noise. `text=auto` lets git decide what is text, and `eol=lf` pins the line
 * ending both in the repository and in every working copy, which is what the
 * generated .editorconfig already asks editors to do.
 *
 * Binary rules are deliberately absent: git detects binary content on its own,
 * and no preset generates binary files. Add specific rules when a project
 * actually gains file types that need them.
 */
export function renderGitAttributes(): string {
  return `# Normalize line endings to LF in the repository and in every working copy.
* text=auto eol=lf
`;
}
