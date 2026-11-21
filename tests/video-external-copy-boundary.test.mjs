import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const prepare=await readFile(new URL('../scripts/prepare-web.mjs',import.meta.url),'utf8');
const packageJson=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const capacitor=JSON.parse(await readFile(new URL('../capacitor.config.json',import.meta.url),'utf8'));

function input(id){
 const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const m=html.match(new RegExp('<input\\s+[^>]*\\bid="'+escaped+'"[^>]*>'));
 assert.ok(m,'Required video input '+id+' missing');
 return m[0];
}
function notice(id, near){
 const start=html.indexOf('id="'+near+'"');
 const anchor=html.indexOf('id="'+id+'"',start);
 assert.ok(start>=0 && anchor>start && anchor-start<1500,id+' not adjacent to relevant capture path');
 const end=html.indexOf('</p>',anchor);
 assert.ok(end>anchor);
 return html.slice(anchor,end);
}

test('entrance video is handled by a file input, not a guaranteed app-private Android camera',()=>{
 const el=input('entranceVideoInput');
 assert.match(el,/type="file"/);
 assert.match(el,/accept="video\/\*"/);
 assert.match(el,/capture="environment"/);
 assert.match(el,/handleEntranceVideoFile/);
});
test('journal camera and picker use file input without automatic ownership of external originals',()=>{
 assert.match(input('captureVideo'),/type="file"/);
 assert.match(input('captureVideo'),/capture="environment"/);
 assert.match(input('rmedia'),/type="file"/);
 assert.match(input('rmedia'),/accept="image\/\*,video\/\*"/);
});
test('entrance capture disclosure explains unverified external copies and disabled cleanup',()=>{
 const n=notice('entranceVideoExternalCopyNotice','entranceVideoInput');
 assert.match(n,/Галерее|Галереи/);
 assert.match(n,/внешние копии/);
 assert.match(n,/не удаляет/);
 assert.match(n,/отключена/);
});
test('journal video disclosure does not equate deleting app copy with deleting phone original',()=>{
 const n=notice('recordVideoExternalCopyNotice','rmedia');
 assert.match(n,/Downloads/);
 assert.match(n,/не удаляет внешние/);
 assert.match(n,/не означает удаления/);
});
test('app build copies these disclosures into Android web resources',()=>{
 assert.ok(prepare.includes('for (const file of ["index.html"'));
 assert.ok(prepare.includes('await copyFile(file, `www/${file}`)'));
 assert.equal(packageJson.scripts['web:prepare'],'node scripts/prepare-web.mjs');
 assert.equal(capacitor.webDir,'www');
});
test('no UI path enables premature entrance video deletion',()=>{
 const fn=html.match(/function deleteEntranceVideoBlob\(id\)\{[\s\S]*?\n\}/);
 assert.ok(fn,'entry-point deletion guard must exist');
 assert.match(fn[0],/Promise\.reject/);
 assert.match(fn[0],/ENTRANCE_VIDEO_/);
 assert.doesNotMatch(fn[0],/objectStore\(['"]entrance_media['"]\)\.delete/);
});
