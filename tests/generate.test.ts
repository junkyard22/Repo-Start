import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { RepoStartError } from '../src/config/validate.ts';
import { generateProject } from '../src/generators/generate-project.ts';
import { ALL_TYPES, fileContents, pathsOf, planFor, testConfig } from './helpers.ts';

describe('generic project generation', () => {
  const plan = planFor({ type: 'generic' });

  test('creates the hygiene files and nothing language specific', () => {
    const paths = pathsOf(plan);

    assert.ok(paths.includes('README.md'));
    assert.ok(paths.includes('.gitignore'));
    assert.ok(paths.includes('.editorconfig'));
    assert.ok(!paths.includes('package.json'));
    assert.ok(!paths.includes('pyproject.toml'));
  });

  test('keeps src/ and tests/ with a .gitkeep so git tracks them', () => {
    const paths = pathsOf(plan);

    assert.ok(paths.includes('src/.gitkeep'));
    assert.ok(paths.includes('tests/.gitkeep'));
    assert.deepEqual(plan.directories, ['src', 'tests']);
  });

  test('omits CI because there is no real command to run, and says so', () => {
    const requested = planFor({ type: 'generic', includeCi: true });

    assert.ok(!pathsOf(requested).includes('.github/workflows/ci.yml'));
    assert.equal(requested.notes.length, 1);
    assert.match(requested.notes[0] ?? '', /Skipped GitHub Actions CI/);
  });

  test('omits sections that have no commands from the README', () => {
    const readme = fileContents(plan, 'README.md');

    assert.ok(!readme.includes('## Testing'));
    assert.ok(!readme.includes('## Development'));
    assert.ok(readme.includes('## Project Structure'));
  });
});

describe('node-ts project generation', () => {
  const plan = planFor({ type: 'node-ts', name: 'Demo Node' });

  test('creates a manifest, entry point and a starter test', () => {
    const paths = pathsOf(plan);

    assert.ok(paths.includes('package.json'));
    assert.ok(paths.includes('tsconfig.json'));
    assert.ok(paths.includes('src/index.ts'));
    assert.ok(paths.includes('tests/greet.test.ts'));
  });

  test('derives a valid package name from the display name', () => {
    const manifest = JSON.parse(fileContents(plan, 'package.json')) as { name: string };

    assert.equal(manifest.name, 'demo-node');
  });

  test('marks private repositories as private in package.json', () => {
    const publicManifest = JSON.parse(fileContents(plan, 'package.json')) as {
      private?: boolean;
    };
    const privatePlan = planFor({ type: 'node-ts', visibility: 'private' });
    const privateManifest = JSON.parse(fileContents(privatePlan, 'package.json')) as {
      private?: boolean;
    };

    assert.equal(publicManifest.private, undefined);
    assert.equal(privateManifest.private, true);
  });

  test('generates a CI workflow that runs the project commands', () => {
    const workflow = fileContents(plan, '.github/workflows/ci.yml');

    assert.match(workflow, /actions\/checkout/);
    assert.match(workflow, /actions\/setup-node/);
    assert.match(workflow, /run: npm run build/);
    assert.match(workflow, /run: npm test/);
  });
});

describe('python project generation', () => {
  const plan = planFor({ type: 'python', name: 'Demo Python' });

  test('creates a package under src/ and a matching test', () => {
    const paths = pathsOf(plan);

    assert.ok(paths.includes('pyproject.toml'));
    assert.ok(paths.includes('src/demo_python/__init__.py'));
    assert.ok(paths.includes('src/demo_python/core.py'));
    assert.ok(paths.includes('tests/test_core.py'));
  });

  test('the test imports the module the preset actually created', () => {
    assert.match(fileContents(plan, 'tests/test_core.py'), /from demo_python\.core import greet/);
  });

  test('records the license in pyproject.toml', () => {
    assert.match(fileContents(plan, 'pyproject.toml'), /license = "MIT"/);
  });

  test('adds a four space rule for Python to .editorconfig', () => {
    assert.match(fileContents(plan, '.editorconfig'), /\[\*\.py\]\nindent_size = 4/);
  });
});

describe('react-ts project generation', () => {
  const plan = planFor({ type: 'react-ts', name: 'Demo React' });

  test('creates the smallest reasonable Vite structure', () => {
    const paths = pathsOf(plan);

    assert.ok(paths.includes('index.html'));
    assert.ok(paths.includes('vite.config.ts'));
    assert.ok(paths.includes('src/main.tsx'));
    assert.ok(paths.includes('src/App.tsx'));
    assert.ok(paths.includes('tests/greeting.test.ts'));
  });

  test('never publishes an application by accident', () => {
    const manifest = JSON.parse(fileContents(plan, 'package.json')) as { private?: boolean };

    assert.equal(manifest.private, true);
  });
});

describe('README contents', () => {
  test('uses the project name and description, not a placeholder', () => {
    const plan = planFor({
      type: 'node-ts',
      name: 'Ledger Tools',
      description: 'Reconciles invoices against bank exports.',
    });
    const readme = fileContents(plan, 'README.md');

    assert.ok(readme.startsWith('# Ledger Tools\n'));
    assert.ok(readme.includes('Reconciles invoices against bank exports.'));
  });

  test('shows the commands the preset actually generated', () => {
    const readme = fileContents(planFor({ type: 'python' }), 'README.md');

    assert.ok(readme.includes('pytest'));
    assert.ok(readme.includes('python -m venv .venv'));
    assert.ok(!readme.includes('npm install'));
  });

  test('renders a project structure that matches the generated files', () => {
    const plan = planFor({ type: 'node-ts' });
    const readme = fileContents(plan, 'README.md');

    for (const filePath of pathsOf(plan)) {
      const leaf = filePath.split('/').pop() ?? filePath;

      assert.ok(readme.includes(leaf), `README structure is missing ${filePath}`);
    }
  });

  test('drops the license section when no license was chosen', () => {
    const readme = fileContents(planFor({ license: 'none' }), 'README.md');

    assert.ok(!readme.includes('## License'));
  });
});

describe('.gitignore', () => {
  test('matches the project type', () => {
    assert.match(fileContents(planFor({ type: 'node-ts' }), '.gitignore'), /node_modules\//);
    assert.match(fileContents(planFor({ type: 'python' }), '.gitignore'), /__pycache__\//);
    assert.match(fileContents(planFor({ type: 'python' }), '.gitignore'), /\.venv\//);
    assert.match(fileContents(planFor({ type: 'react-ts' }), '.gitignore'), /node_modules\//);
    assert.ok(!fileContents(planFor({ type: 'python' }), '.gitignore').includes('node_modules/'));
  });

  test('ignores .env but never .env.example', () => {
    for (const type of ALL_TYPES) {
      const gitignore = fileContents(planFor({ type }), '.gitignore');

      assert.ok(gitignore.includes('.env'), `${type} should ignore .env`);
      assert.ok(gitignore.includes('!.env.example'), `${type} must un-ignore .env.example`);
    }
  });

  test('does not un-ignore a file that was never generated', () => {
    const gitignore = fileContents(planFor({ includeEnvExample: false }), '.gitignore');

    assert.ok(!gitignore.includes('!.env.example'));
  });
});

describe('.gitattributes', () => {
  test('is generated for every preset', () => {
    for (const type of ALL_TYPES) {
      assert.ok(
        pathsOf(planFor({ type })).includes('.gitattributes'),
        `${type} should generate a .gitattributes`,
      );
    }
  });

  test('normalizes line endings to LF and nothing more', () => {
    const contents = fileContents(planFor(), '.gitattributes');

    assert.match(contents, /^\* text=auto eol=lf$/m);
    assert.ok(contents.endsWith('\n'));

    const rules = contents
      .split('\n')
      .filter((line) => line.trim().length > 0 && !line.startsWith('#'));

    assert.deepEqual(rules, ['* text=auto eol=lf']);
  });

  test('is repository hygiene, so it is never optional', () => {
    const minimal = planFor({
      type: 'node-ts',
      license: 'none',
      includeEnvExample: false,
      includeAgents: false,
      includeContributing: false,
      includeChangelog: false,
      includeDocs: false,
      includeCi: false,
      includeIssueTemplate: false,
      includePullRequestTemplate: false,
    });

    assert.ok(pathsOf(minimal).includes('.gitattributes'));
  });

  test('appears in the README project structure', () => {
    for (const type of ALL_TYPES) {
      const readme = fileContents(planFor({ type }), 'README.md');
      const structure = readme.slice(readme.indexOf('## Project Structure'));

      assert.match(structure, /\.gitattributes/, `${type} structure should list .gitattributes`);
    }
  });

  test('agrees with the .editorconfig end_of_line rule', () => {
    const plan = planFor();

    assert.match(fileContents(plan, '.editorconfig'), /end_of_line = lf/);
    assert.match(fileContents(plan, '.gitattributes'), /eol=lf/);
  });
});

describe('.env.example', () => {
  test('contains placeholders and no credential values', () => {
    for (const type of ALL_TYPES) {
      const contents = fileContents(planFor({ type }), '.env.example');

      assert.match(contents, /APP_ENV=development/);
      assert.ok(!/(secret|password|token|api[_-]?key)\s*=\s*\S+/i.test(contents));

      for (const line of contents.split('\n')) {
        if (line.startsWith('#') || line.trim().length === 0) {
          continue;
        }

        const [, value = ''] = line.split('=');

        assert.ok(value.length < 40, `Suspiciously long value in .env.example: ${line}`);
      }
    }
  });
});

describe('optional files', () => {
  const everything = planFor({
    type: 'node-ts',
    includeEnvExample: true,
    includeAgents: true,
    includeContributing: true,
    includeChangelog: true,
    includeDocs: true,
    includeCi: true,
    includeIssueTemplate: true,
    includePullRequestTemplate: true,
  });

  const nothing = planFor({
    type: 'node-ts',
    license: 'none',
    includeEnvExample: false,
    includeAgents: false,
    includeContributing: false,
    includeChangelog: false,
    includeDocs: false,
    includeCi: false,
    includeIssueTemplate: false,
    includePullRequestTemplate: false,
  });

  const optionalPaths = [
    '.env.example',
    'AGENTS.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    'docs/README.md',
    '.github/workflows/ci.yml',
    '.github/ISSUE_TEMPLATE/bug_report.md',
    '.github/ISSUE_TEMPLATE/feature_request.md',
    '.github/pull_request_template.md',
    'LICENSE',
  ];

  test('are all present when requested', () => {
    const paths = pathsOf(everything);

    for (const optional of optionalPaths) {
      assert.ok(paths.includes(optional), `Expected ${optional} to be generated`);
    }
  });

  test('are all absent when declined', () => {
    const paths = pathsOf(nothing);

    for (const optional of optionalPaths) {
      assert.ok(!paths.includes(optional), `Expected ${optional} to be omitted`);
    }
  });

  test('leave the README without references to files that do not exist', () => {
    const readme = fileContents(nothing, 'README.md');

    assert.ok(!readme.includes('CONTRIBUTING.md'));
    assert.ok(!readme.includes('CHANGELOG.md'));
    assert.ok(!readme.includes('## Configuration'));
    assert.ok(!readme.includes('LICENSE'));
  });
});

describe('license files', () => {
  test('name the copyright holder and the year', () => {
    const plan = planFor({ license: 'mit' });

    assert.match(fileContents(plan, 'LICENSE'), /Copyright \(c\) 2026 Test Author/);
  });

  test('include the full canonical text for Apache-2.0 and GPL-3.0', () => {
    const apache = fileContents(planFor({ license: 'apache-2.0' }), 'LICENSE');
    const gpl = fileContents(planFor({ license: 'gpl-3.0' }), 'LICENSE');

    assert.match(apache, /Apache License/);
    assert.ok(apache.length > 10000);
    assert.match(gpl, /GNU GENERAL PUBLIC LICENSE/);
    assert.ok(gpl.length > 30000);
  });
});

describe('invalid configuration', () => {
  test('fails safely on an empty project name', () => {
    assert.throws(
      () => generateProject(testConfig({ name: '  ' }), { directoryName: 'x' }),
      (error: unknown) => error instanceof RepoStartError,
    );
  });

  test('fails safely on a name containing path separators', () => {
    assert.throws(
      () => generateProject(testConfig({ name: '../escape' }), { directoryName: 'x' }),
      (error: unknown) =>
        error instanceof RepoStartError && error.details.some((d) => d.includes('cannot contain')),
    );
  });

  test('fails safely on a reserved Windows device name', () => {
    assert.throws(
      () => generateProject(testConfig({ name: 'CON' }), { directoryName: 'x' }),
      (error: unknown) => error instanceof RepoStartError,
    );
  });

  test('fails safely on an unknown project type', () => {
    assert.throws(
      () =>
        generateProject(testConfig({ type: 'rust' as never }), { directoryName: 'x' }),
      (error: unknown) => error instanceof RepoStartError,
    );
  });
});
