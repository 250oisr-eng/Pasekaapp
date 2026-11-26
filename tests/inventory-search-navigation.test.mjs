import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function openEquipmentInventory(');
const code=html.slice(start,html.indexOf('async function createInventoryStock(',start));
test('a corpus search result focuses its exact inventory card, clearing filters only when needed',()=>{
 const calls=[];
 const card={hidden:true,focus:()=>calls.push('focus'),scrollIntoView:()=>calls.push('scroll')};
 const fields={'inventory-body-one':card,equipmentInventoryDlg:{showModal:()=>calls.push('open')},
  inventoryFilterResult:{},inventorySearch:{focus:()=>calls.push('search')}};
 const open=new Function('$','renderEquipmentInventory','clearEquipmentInventoryFilters',code+';return openEquipmentInventory')(
  id=>fields[id],()=>calls.push('render'),()=>{calls.push('clear');card.hidden=false;});
 open('one');
 assert.deepEqual(calls,['render','open','clear','focus','scroll']);
 calls.length=0;
 open('one');
 assert.deepEqual(calls,['render','open','focus','scroll']);
 calls.length=0;
 open('removed');
 assert.match(fields.inventoryFilterResult.textContent,/не найден/);
 assert.deepEqual(calls,['render','open','search']);
 calls.length=0;
 open();
 assert.deepEqual(calls,['render','open']);
 assert.match(html,/openEquipmentInventory\(button.dataset.id\)/);
});
