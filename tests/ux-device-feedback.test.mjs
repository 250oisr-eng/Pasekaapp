import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('dashboard tiles are actions and share attention source',()=>{for(const kind of ['hives','families','signals','stale'])assert.ok(html.includes('data-overview-kind="'+kind+'"'));assert.match(html,/function apiaryAttentionRows\(state,date\)/);assert.equal((html.match(/apiaryAttentionRows\(S,today\(\)\)/g)||[]).length,2);});
test('creation has explicit followup, keyboard viewport and symmetric media buttons',()=>{assert.match(html,/hiveOnboardingId=h.id;renderHiveOnboarding\(\)/);assert.match(html,/addFamily\(selectedHiveId\);\$\('familyOrigin'\).value=origin/);assert.match(html,/interactive-widget=resizes-content/);assert.match(html,/visualViewport.addEventListener\('resize',updateKeyboardViewport\)/);assert.match(html,/class="capture-icon" aria-label="Снять фото"/);assert.match(html,/class="capture-icon" aria-label="Снять видео"/);});
