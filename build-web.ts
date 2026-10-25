// Builds web/index.html: the real engine (types stripped) + a small demo UI, in one self-contained file.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const rd = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const files = ['core/config', 'core/ranking', 'core/ladder', 'core/sharing', 'core/messages', 'agents/personalAgent', 'agents/groupAgent', 'sim/night'];
const engine = files.map(f => stripTypeScriptTypes(rd(`src/${f}.ts`), { mode: 'strip' })
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '')
  .replace(/^export\s+/gm, '')
  .split('\n').filter(l => !/^\s*\/\//.test(l)).map(l => l.replace(/^\s+/, '').replace(/ {2,}/g, ' ')).filter(Boolean).join('\n')).join('\n');
const html = rd('web/template.html').replace('/*CFG*/', () => JSON.stringify(JSON.parse(rd('config/default.json')))).replace('/*ENGINE*/', () => engine);
writeFileSync(new URL('../web/index.html', import.meta.url), html);
console.log(`web/index.html written (${(html.length / 1024).toFixed(1)} KB)`);
