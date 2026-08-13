import type { ProjectConfig } from '../config/types.ts';

/**
 * A small, cross platform .editorconfig. Enough to keep line endings and
 * indentation consistent, and nothing else.
 */
export function renderEditorConfig(config: ProjectConfig): string {
  const sections = [
    'root = true',
    '',
    '[*]',
    'charset = utf-8',
    'end_of_line = lf',
    'indent_style = space',
    'indent_size = 2',
    'insert_final_newline = true',
    'trim_trailing_whitespace = true',
    '',
    '[*.md]',
    'trim_trailing_whitespace = false',
  ];

  if (config.type === 'python') {
    sections.push('', '[*.py]', 'indent_size = 4');
  }

  sections.push('');

  return sections.join('\n');
}
