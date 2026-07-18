import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredHeaders = [
  'purpose',
  'audience',
  'authoritative-for',
  'update-triggers',
  'related-docs',
];
const immutableSources = new Set([
  'docs/product/Meridian_Design_Specification_v1.2.md',
]);
function findMarkdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absoluteEntry = resolve(directory, entry.name);
    if (entry.isDirectory()) return findMarkdownFiles(absoluteEntry);
    return entry.isFile() && entry.name.endsWith('.md')
      ? [relative(repositoryRoot, absoluteEntry)]
      : [];
  });
}

const markdownFiles = ['docs', 'apps', 'packages'].flatMap((directory) =>
  findMarkdownFiles(resolve(repositoryRoot, directory)),
);
const errors = [];

for (const file of markdownFiles) {
  const absoluteFile = resolve(repositoryRoot, file);
  const contents = readFileSync(absoluteFile, 'utf8');

  if (!immutableSources.has(file)) {
    const frontMatterMatch = contents.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontMatterMatch) {
      errors.push(`${file}: missing YAML document header`);
    } else {
      const frontMatter = frontMatterMatch[1] ?? '';
      for (const header of requiredHeaders) {
        if (!new RegExp(`^${header}:\\s*\\S`, 'm').test(frontMatter)) {
          errors.push(`${file}: missing non-empty ${header} header`);
        }
      }
    }
  }

  for (const match of contents.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1]?.trim();
    if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue;
    const path = target.replace(/^<|>$/g, '').split('#', 1)[0];
    if (!path) continue;
    const resolvedTarget = resolve(
      dirname(absoluteFile),
      decodeURIComponent(path),
    );
    if (!existsSync(resolvedTarget) || !statSync(resolvedTarget).isFile()) {
      errors.push(`${file}: broken internal link ${target}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Checked ${markdownFiles.length} Markdown documents.`);
