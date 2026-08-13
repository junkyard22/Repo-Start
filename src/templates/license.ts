import { readFileSync } from 'node:fs';
import type { LicenseId } from '../config/types.ts';

/**
 * License texts live in ./assets/licenses as verbatim copies of the canonical
 * documents, so Repo Start never paraphrases a license and never needs a
 * network connection to write one.
 */
function readAsset(fileName: string): string {
  const url = new URL(`../../assets/licenses/${fileName}`, import.meta.url);
  return readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
}

const MIT_TEMPLATE = `MIT License

Copyright (c) {{year}} {{author}}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const SPDX_IDS: Record<LicenseId, string | null> = {
  mit: 'MIT',
  'apache-2.0': 'Apache-2.0',
  'gpl-3.0': 'GPL-3.0-or-later',
  none: null,
};

/** The SPDX identifier for a license, or null when no license was chosen. */
export function spdxId(license: LicenseId): string | null {
  return SPDX_IDS[license];
}

/**
 * Render the LICENSE file, filling in the copyright holder where the canonical
 * text leaves a placeholder. Returns null when no license was selected.
 */
export function renderLicense(license: LicenseId, author: string, year: number): string | null {
  const copyrightYear = String(year);

  switch (license) {
    case 'mit':
      return MIT_TEMPLATE.replace('{{year}}', copyrightYear).replace('{{author}}', author);

    case 'apache-2.0':
      return readAsset('apache-2.0.txt')
        .replace('[yyyy]', copyrightYear)
        .replace('[name of copyright owner]', author);

    case 'gpl-3.0':
      return readAsset('gpl-3.0.txt')
        .replace('<year>', copyrightYear)
        .replace('<name of author>', author);

    case 'none':
      return null;

    default:
      return null;
  }
}
