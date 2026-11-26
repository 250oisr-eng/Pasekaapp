// Pure read-only preflight validators. No subprocesses, device actions or writes.
export const PACKAGE='ru.paseka.journal.disasterproof2';
const error=code=>Object.assign(new Error(code),{code});
export function parseDeviceList(output){
 const entries=String(output).split(/\r?\n/).slice(1).filter(line=>line.trim()&&!line.startsWith('*')).map(line=>{
  const parts=line.trim().split(/\s+/);
  return {serial:parts[0],status:parts[1]};
 });
 if(entries.length===0)throw error('ADB_USB_DEVICE_NOT_VISIBLE');
 if(entries.length!==1)throw error('ADB_MULTIPLE_DEVICES_CONNECTED');
 const {serial,status}=entries[0];
 if(status==='unauthorized')throw error('ADB_USB_DEBUGGING_NOT_AUTHORIZED');
 if(status==='offline')throw error('ADB_USB_DEVICE_OFFLINE');
 if(status!=='device')throw error('ADB_DEVICE_NOT_READY');
 if(/^emulator-/i.test(serial)||/:\d+$/.test(serial)||/_adb-tls-connect\._tcp/i.test(serial))
  throw error('ADB_WIRELESS_OR_EMULATOR_NOT_ALLOWED');
 return serial;
}
export function validateUsbTransportState(state){
 if(String(state).trim()!=='device')throw error('ADB_PHYSICAL_USB_TRANSPORT_NOT_READY');
 return true;
}
export function validateManifest(m){
 if(m?.packageId!==PACKAGE||m?.originalPackageId!=='ru.paseka.journal'||
    m?.apkFile!=='app-debug.apk'||!/^[a-f0-9]{64}$/.test(m?.apkSha256||'')||
    !/^[a-f0-9]{40}$/.test(m?.sourceSha||''))
  throw error('UNTRUSTED_DIAGNOSTIC_MANIFEST');
}
