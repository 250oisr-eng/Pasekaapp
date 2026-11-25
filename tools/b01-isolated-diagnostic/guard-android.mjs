// Run only after npx cap add android in the isolated generated workspace.
// Replaces *only* the generated diagnostic MainActivity, never the real app.
import { promises as fs } from 'node:fs';
import { resolve, dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
const EXPECTED='ru.paseka.journal.diagnostic.restore';
export async function installEmulatorGuard(workspace) {
 if(!workspace) throw new Error('EXPLICIT_ISOLATED_WORKSPACE_REQUIRED');
 const dst=await fs.realpath(resolve(workspace));
 const src=await fs.realpath(ROOT);
 if(dst===src || dst.startsWith(src+sep) || src.startsWith(dst+sep))throw new Error('SOURCE_TREE_NOT_ALLOWED');
 const cfg=JSON.parse(await fs.readFile(join(dst,'capacitor.config.json'),'utf8'));
 if(cfg.appId!==EXPECTED)throw new Error('NOT_ISOLATED_DIAGNOSTIC_APP_ID');
 const target=join(dst,'android/app/src/main/java/ru/paseka/journal/diagnostic/restore/MainActivity.java');
 const old=await fs.readFile(target,'utf8');
 if(!old.includes('extends BridgeActivity') || !old.includes('package '+EXPECTED+';'))throw new Error('UNEXPECTED_GENERATED_ANDROID_ACTIVITY');
 const content=await fs.readFile(join(ROOT,'tools/b01-isolated-diagnostic/MainActivity.java'),'utf8');
 if(!content.includes('B01_EMULATOR_ONLY_NO_PHYSICAL_DEVICE') || !content.includes('emulatedHardware && emulatedFingerprint'))throw new Error('EMULATOR_GUARD_NOT_PRESENT');
 await fs.writeFile(target,content,{flag:'w'});
 return target;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 installEmulatorGuard(process.argv[2]).then(()=>console.log('B01_EMULATOR_GUARD_INSTALLED')).catch(e=>{
  console.error('BLOCKED '+e.message);process.exitCode=1;
 });
}
