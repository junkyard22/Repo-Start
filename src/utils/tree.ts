interface TreeNode {
  name: string;
  isFile: boolean;
  children: Map<string, TreeNode>;
}

function createNode(name: string, isFile: boolean): TreeNode {
  return { name, isFile, children: new Map() };
}

function insert(root: TreeNode, path: string): void {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  let current = root;

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    const existing = current.children.get(segment);

    if (existing) {
      // A path can arrive as both directory and file prefix; file wins only
      // when it is genuinely a leaf.
      existing.isFile = existing.isFile && isLast;
      current = existing;
      return;
    }

    const node = createNode(segment, isLast);
    current.children.set(segment, node);
    current = node;
  });
}

function sortChildren(node: TreeNode): TreeNode[] {
  return [...node.children.values()].sort((a, b) => {
    if (a.isFile !== b.isFile) {
      return a.isFile ? 1 : -1;
    }
    return a.name.localeCompare(b.name, 'en');
  });
}

function renderChildren(node: TreeNode, prefix: string, lines: string[]): void {
  const children = sortChildren(node);

  children.forEach((child, index) => {
    const isLast = index === children.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const suffix = child.isFile ? '' : '/';

    lines.push(`${prefix}${connector}${child.name}${suffix}`);
    renderChildren(child, `${prefix}${isLast ? '    ' : '│   '}`, lines);
  });
}

/**
 * Render a file listing as an ASCII tree.
 *
 * `filePaths` are files, `directoryPaths` are directories that should appear
 * even when nothing was generated inside them.
 */
export function renderTree(
  rootLabel: string,
  filePaths: string[],
  directoryPaths: string[] = [],
): string {
  const root = createNode(rootLabel, false);

  for (const directory of directoryPaths) {
    insert(root, `${directory.replace(/\/+$/, '')}/`);
  }
  for (const file of filePaths) {
    insert(root, file);
  }

  const lines = [`${rootLabel}/`];
  renderChildren(root, '', lines);

  return lines.join('\n');
}
