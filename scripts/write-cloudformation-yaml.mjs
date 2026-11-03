import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { stringify } from 'yaml';

const SYNTHESIZED_TEMPLATE_PATH = 'cdk.out/GitHubOidcStack.template.json';
const OUTPUT_TEMPLATE_PATH = 'cloudformation/github-oidc.yml';

async function readJsonTemplate(templatePath) {
  return JSON.parse(await readFile(templatePath, 'utf8'));
}

function toYamlDocument(template) {
  return stringify(template, { lineWidth: 0 });
}

async function writeYamlTemplate(templatePath, content) {
  await mkdir(dirname(templatePath), { recursive: true });
  await writeFile(templatePath, content);
}

async function main() {
  const template = await readJsonTemplate(SYNTHESIZED_TEMPLATE_PATH);
  await writeYamlTemplate(OUTPUT_TEMPLATE_PATH, toYamlDocument(template));
}

await main();
