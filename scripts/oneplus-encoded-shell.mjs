// ADB exec-out concatenates remote argv into a shell command. The quoted
// sh -c argument MUST survive that outer Android shell; Node spawn(shell:false)
// only avoids a Windows shell and does not escape Android shell syntax.
const PACKAGE='ru.paseka.journal';
const PREVIEW='PASEKA_BASE64_PROBE_V1';
const COMMANDS=Object.freeze({
 probe:'set -o pipefail; test -d app_webview || exit 47; printf PASEKA_BASE64_PROBE_V1 | base64',
 archive:'set -o pipefail; test -d app_webview || exit 47; tar -cf - . | base64'
});
export function encodedShellArgs(serial,kind){
 if(!/^[A-Za-z0-9_.:\-]+$/.test(serial))throw Error('INVALID_DEVICE_SERIAL');
 if(!Object.hasOwn(COMMANDS,kind))throw Error('INVALID_ENCODED_COMMAND');
 return ['-s',serial,'exec-out','run-as',PACKAGE,'sh','-c',`'${COMMANDS[kind]}'`];
}
export function classifyEncodedProbe({code,output='',overflow=false}){
 const expected=Buffer.from(PREVIEW,'ascii').toString('base64');
 const normalized=output.replace(/[\r\n]/g,'');
 const fact={schema:'paseka-encoded-shell-probe-v1',status:'BLOCKED',reason:'BASE64_PREFLIGHT_MISMATCH',
   remoteExitCode:Number.isInteger(code)?code:null,outputBytes:Buffer.byteLength(output,'latin1'),
   normalizedBytes:Buffer.byteLength(normalized,'latin1'),phoneFilesChanged:false,
   privateDataRead:false,backupAttempted:false};
 if(overflow){fact.reason='BASE64_PREFLIGHT_OUTPUT_LIMIT';return fact;}
 if(code!==0){fact.reason='BASE64_PREFLIGHT_COMMAND_FAILED';return fact;}
 if(normalized===expected){fact.status='PASS';fact.reason=null;return fact;}
 if(normalized.length===0)fact.reason='BASE64_PREFLIGHT_EMPTY';
 else if(normalized===PREVIEW)fact.reason='BASE64_PREFLIGHT_PLAINTEXT';
 else if(!/^[A-Za-z0-9+/=]+$/.test(normalized))fact.reason='BASE64_PREFLIGHT_NON_BASE64_OUTPUT';
 else fact.reason='BASE64_PREFLIGHT_DIFFERENT_BASE64';
 return fact;
}
export {PACKAGE};
