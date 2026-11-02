import {readFile,writeFile} from 'node:fs/promises';
const html=await readFile(new URL('./dist/index.html',import.meta.url),'utf8');
const css=(await readFile(new URL('./dist/style.css',import.meta.url),'utf8')).replace(/^@import[^;]*;\s*/,'');
const engine=(await readFile(new URL('./dist/engine.js',import.meta.url),'utf8')).replace(/^export /gm,'');
const app=(await readFile(new URL('./dist/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
const offline=html.replace('<link rel="stylesheet" href="style.css">',`<style>${css}</style>`).replace('<script type="module" src="app.js"></script>',`<script type="module">\n${engine}\n${app}\n</script>`);
await writeFile(new URL('./dist/LeakLens_离线演示.html',import.meta.url),offline,'utf8');
console.log('Created dist/LeakLens_离线演示.html — standalone; no server needed.');
