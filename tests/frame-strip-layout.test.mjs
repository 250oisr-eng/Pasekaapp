import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('frame grids use recorded frame counts rather than six columns unconditionally', () => {
  assert.ok(html.includes('grid-template-columns:repeat(var(--frame-count,6),minmax(25px,1fr))'));
  for (const name of ['box.frames', 'x.frames', 'b.frames']) {
    const binding = "style=\"--frame-count:'+Math.max(1," + name + ".length)+'\">";
    assert.ok(html.includes(binding), name + ' frame-count binding must exist');
  }
});

test('CSS binds frame count on all three existing brood-frame renderers', () => {
  assert.equal((html.match(/style="--frame-count:/g) || []).length, 3);
  assert.ok(html.includes('width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden'));
  assert.ok(!html.includes('grid-template-columns:repeat(6,minmax(0,1fr));gap:2px;margin-top:5px}'));
});

test('interactive frame chips can be activated with Enter and Space without triggering parent navigation',()=>{
  const start=html.indexOf('function frameChip(');
  const end=html.indexOf('function openFrameFromDiagram(',start);
  assert.ok(start>=0&&end>start);
  const markup=html.slice(start,end);
  for (const token of ['role="button"','tabindex="0"','onkeydown="if(event.key===', 'Enter', 'event.preventDefault()', 'event.stopPropagation()', 'openFrameFromDiagram']) {
    assert.ok(markup.includes(token),'frame-chip keyboard support missing '+token);
  }
});
