import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const configuration=JSON.parse(await readFile(new URL('default.json',root),'utf8'));
const keys=['ping2AfterMin','alertAfterMin','waitWindowMin','slowdownFactor','pdLinkAtMin'];
const config=JSON.stringify(Object.fromEntries(keys.map(key=>[key,configuration[key]])),null,2)+'\n';
await writeFile(new URL('web/config.json',root),config);
await mkdir(new URL('dist/',root),{recursive:true});
for(const name of ['index.html','styles.css','app.js','favicon.svg','config.json'])await copyFile(new URL('web/'+name,root),new URL('dist/'+name,root));
console.log('Built the standalone Walk Me Home landing in dist/. No engine or API calls were made.');
