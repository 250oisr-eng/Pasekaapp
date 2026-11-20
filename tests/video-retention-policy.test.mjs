import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const policy=await readFile(new URL('../docs/VIDEO-RETENTION-POLICY.md',import.meta.url),'utf8');
const agents=await readFile(new URL('../AGENTS.md',import.meta.url),'utf8');

test('all original videos require successful, persisted recognition before cleanup',()=>{
 assert.match(policy,/Все оригиналы видео/);
 assert.match(policy,/RESULT_CONFIRMED/);
 assert.match(policy,/DELETE_REQUIRED/);
 assert.match(policy,/не исходный видеобинарник/);
 assert.match(agents,/временное хранение ВСЕХ видео/);
});

test('existing two storage paths remain distinguishable and no unimplemented deletion is advertised',()=>{
 assert.match(html,/transaction\('entrance_media','readwrite'\)/);
 assert.match(html,/status:'waiting_for_server'/);
 assert.match(html,/media\.push\(\{kind:'video'/);
 assert.match(html,/pendingRecordMedia\.push\(item\)/);
 assert.match(html,/Автоудаление ещё не подключено|автоудаление ещё не подключено/);
 assert.match(html,/Сервер анализа ещё не подключён/);
 assert.match(html,/автоматическое удаление пока не работает/);
 assert.match(html,/Видео добавлено для временного хранения до распознавания/);
});

test('policy prohibits premature deletion and unsafe mutation of existing backups',()=>{
 assert.match(policy,/Нельзя удалять на основании отправки/);
 assert.match(policy,/После подтверждённого успешного распознавания оригиналы должны быть удалены/);
 assert.match(policy,/Нельзя без отдельного разрешения необратимо удалять или перезаписывать существующие резервные копии/);
 assert.match(policy,/не является разрешением удалять сейчас существующие неопознанные видео/);
});
