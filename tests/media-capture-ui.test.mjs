import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const token = 'function ' + name + '(';
  let start = html.indexOf(token);
  if (start < 0) start = html.indexOf('async ' + token);
  assert.ok(start >= 0, 'missing function ' + name);
  const candidates = [
    html.indexOf('\nfunction ', start + token.length),
    html.indexOf('\nasync function ', start + token.length),
  ].filter(index => index >= 0);
  const end = candidates.length ? Math.min(...candidates) : html.indexOf('</script>', start);
  return html.slice(start, end < 0 ? html.length : end);
}

test('AI screen exposes local photo capture and defaults to retaining the original', () => {
  assert.match(html, /id="mediaAnalysisPhotoInput" type="file" accept="image\/\*" capture="environment"/);
  assert.match(html, /id="mediaAnalysisRetainOriginal" type="checkbox" checked/);
  assert.match(html, /Файл сохранится только на этом устройстве; сейчас он не отправляется ИИ/);
  assert.match(html, /id="mediaAnalysisJobList"/);
});

test('photo capture creates a local image job and does not call a network transport', () => {
  const handler = extractFunction('handleMediaAnalysisPhoto');
  assert.match(handler, /mediaJobRepository\(\)\.enqueue\(\{id,kind:'image',blob:file/);
  assert.match(handler, /navigator\.storage\?\.estimate/);
  assert.match(handler, /Передача на анализ не подключена; файл не отправлялся в сеть/);
  assert.doesNotMatch(handler, /\bfetch\s*\(|XMLHttpRequest|AI_FUNCTION_URL/);
});

test('entrance video capture uses the temporary media job store with validated metadata', () => {
  const handler = extractFunction('handleEntranceVideoFile');
  assert.match(handler, /mediaJobRepository\(\)\.enqueue\(\{id,kind:'video',blob:file/);
  assert.match(handler, /captureMetadata:\{durationSec:metadata\.durationSec,width:metadata\.width,height:metadata\.height,frameQualityStatus:frameQuality\.status\}/);
  assert.match(handler, /Сетевой передачи и автоматического удаления нет/);
  assert.doesNotMatch(handler, /putEntranceVideo\(/);
});

test('legacy entrance videos remain readable alongside temporary media jobs', () => {
  const list = extractFunction('listEntranceVideos');
  assert.match(list, /transaction\('entrance_media','readonly'\)/);
  assert.match(list, /mediaJobRepository\(\)\.list\(\)/);
  assert.match(list, /storageType:'legacy'/);
  assert.match(list, /storageType:'media_job'/);
});

test('media original deletion requires a verified backup and a separate user confirmation', () => {
  const remove = extractFunction('removeMediaJobOriginal');
  assert.match(remove, /resultBackupRevisionId/);
  assert.match(remove, /resultBackupVerifiedAt/);
  assert.match(remove, /if\(!confirm\(/);
  assert.match(remove, /verifyMediaAnalysisResultBackup/);
  assert.match(remove, /repository\.cleanup\(id,\{verifyBackup\}\)/);
});

test('deleted media originals cannot be previewed from the queue UI', () => {
  const entranceList = extractFunction('refreshEntranceVideos');
  const queueList = extractFunction('refreshMediaAnalysisJobs');
  assert.match(entranceList, /x\.status!=='completed_deleted'/);
  assert.match(queueList, /job\.status!=='completed_deleted'/);
  assert.match(extractFunction('viewMediaAnalysisPhoto'), /!job\.blob/);
  assert.match(extractFunction('viewEntranceVideo'), /!item\?\.blob/);
});

test('AI tab restores the local queue after navigation without automatic cleanup', () => {
  const paintTab = extractFunction('paintTab');
  assert.match(paintTab, /if\(tab==='ai'\)refreshMediaAnalysisJobs\(\)/);
  assert.doesNotMatch(paintTab, /resumeCleanup|\.cleanup\(/);
});
