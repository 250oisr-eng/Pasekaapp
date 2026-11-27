import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function clearGlobalSearch(){');
const end=html.indexOf("\ndocument.addEventListener('keydown',",start);
const source=start>=0&&end>start?html.slice(start,end):'';

function harness(){
 assert.ok(source,'global search functions are present');
 const input={value:'',focused:false,focus(){this.focused=true}};
 const clear={hidden:true};
 const status={textContent:''};
 const results={innerHTML:'',insertAdjacentHTML(position,html){this.innerHTML+=html}};
 const nodes={globalSearch:input,globalSearchClear:clear,globalSearchStatus:status,globalSearchResults:results};
 const S={hives:[],families:[],records:[],equipmentInventory:{bodies:{}}};
 const make=new Function('$','S','safe',source+'\nreturn {renderGlobalSearch,clearGlobalSearch,handleGlobalSearchKeydown}');
 return {input,clear,status,results,actions:make(id=>nodes[id],S,x=>String(x))};
}

test('global search reset control is labeled and at least 44 CSS px',()=>{
 assert.match(html,/id="globalSearch"[^>]*aria-controls="globalSearchResults"[^>]*onkeydown="handleGlobalSearchKeydown\(event\)"/);
 assert.match(html,/id="globalSearchClear" hidden aria-label="Очистить поиск по пасеке"/);
 assert.match(html,/id="globalSearchStatus"[^>]*role="status" aria-live="polite" aria-atomic="true"/);
 assert.match(html,/\.global-search-controls button\{min-height:44px/);
 assert.match(html,/\.global-search-controls button\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(html,/<div id="globalSearchResults" class="global-search-results" aria-live="polite"/);
});

test('empty and whitespace-only searches clear results and status without mutating data',()=>{
 const h=harness();
 h.results.innerHTML='old results';
 h.status.textContent='old status';
 h.input.value='   ';
 h.actions.renderGlobalSearch();
 assert.equal(h.results.innerHTML,'');
 assert.equal(h.status.textContent,'');
 assert.equal(h.clear.hidden,false,'reset is available for whitespace text');
 h.input.value='';
 h.actions.renderGlobalSearch();
 assert.equal(h.clear.hidden,true);
});

test('nonmatching search announces zero results without inventing entries',()=>{
 const h=harness();
 h.input.value='несуществующий запрос';
 h.actions.renderGlobalSearch();
 assert.match(h.results.innerHTML,/Совпадений не найдено/);
 assert.equal(h.status.textContent,'Совпадений не найдено.');
 assert.equal(h.clear.hidden,false);
});

test('one-tap and Escape clear only search UI, return focus and leave state intact',()=>{
 const h=harness();
 h.input.value='пчела';
 h.actions.renderGlobalSearch();
 h.actions.clearGlobalSearch();
 assert.equal(h.input.value,'');
 assert.equal(h.input.focused,true);
 assert.equal(h.clear.hidden,true);
 assert.equal(h.status.textContent,'');
 h.input.value='рамка';
 let prevented=0;
 h.actions.handleGlobalSearchKeydown({key:'Escape',currentTarget:h.input,preventDefault(){prevented++}});
 assert.equal(prevented,1);
 assert.equal(h.input.value,'');
 h.input.value='семья';
 h.actions.handleGlobalSearchKeydown({key:'Enter',currentTarget:h.input,preventDefault(){prevented++}});
 assert.equal(prevented,1);
 assert.equal(h.input.value,'семья');
});
