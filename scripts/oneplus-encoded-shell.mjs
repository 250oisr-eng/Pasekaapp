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

// Each public probe is static: no user text, no filesystem read, no TAR.
// Variants isolate the remote command lexer, the app UID wrapper and base64.
// They are diagnostic only and never grant backup permission automatically.
export const PUBLIC_PROBE_VARIANTS=Object.freeze([
 {id:'outer_printf',args:['exec-out','sh','-c',"'printf PASEKA_BASE64_PROBE_V1'"],expected:'plain'},
 {id:'outer_base64',args:['exec-out','sh','-c',"'printf PASEKA_BASE64_PROBE_V1 | base64'"],expected:'base64'},
 {id:'app_printf',args:['exec-out','run-as',PACKAGE,'sh','-c',"'printf PASEKA_BASE64_PROBE_V1'"],expected:'plain'},
 {id:'app_base64',args:['exec-out','run-as',PACKAGE,'sh','-c',"'printf PASEKA_BASE64_PROBE_V1 | base64'"],expected:'base64'},
 {id:'app_base64_pipefail',args:['exec-out','run-as',PACKAGE,'sh','-c',"'set -o pipefail; printf PASEKA_BASE64_PROBE_V1 | base64'"],expected:'base64'},
]);
export function classifyPublicProbe(result,expectedType){
 const expected=expectedType==='plain'?PREVIEW:Buffer.from(PREVIEW,'ascii').toString('base64');
 const output=result.output||'';
 const normalized=output.replace(/[\r\n]/g,'');
 const bytes=Buffer.byteLength(output,'latin1');
 const fact={status:'BLOCKED',reason:'DIFFERENT_OUTPUT',
  exitCode:Number.isInteger(result.code)?result.code:null,
  outputBytes:bytes,normalizedBytes:Buffer.byteLength(normalized,'latin1'),
  containsExpected:normalized.includes(expected),containsPublicLiteral:normalized.includes(PREVIEW),
  hasControlBytes:/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(normalized)};
 if(result.overflow){fact.reason='OUTPUT_LIMIT';return fact;}
 if(result.code!==0){fact.reason='COMMAND_FAILED';return fact;}
 if(normalized===expected){fact.status='PASS';fact.reason=null;return fact;}
 if(!normalized){fact.reason='EMPTY';return fact;}
 if(fact.containsExpected){fact.reason='EXPECTED_WITH_EXTRA_OUTPUT';return fact;}
 if(!/^[A-Za-z0-9+/=]+$/.test(normalized)){fact.reason='NON_BASE64_OR_SHELL_TEXT';return fact;}
 fact.reason='DIFFERENT_PRINTABLE_OUTPUT';return fact;
}

export {PACKAGE};
