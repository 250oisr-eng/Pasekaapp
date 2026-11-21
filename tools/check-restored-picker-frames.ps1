# Read two pinned synthetic Blobs in the previously installed debug test WebView.
[CmdletBinding()]
param([string]$AdbPath=(Join-Path $env:TEMP 'paseka-offline-platformtools-43f92107c17d47d7a2853a42348efe9b\platform-tools\adb.exe'))
$ErrorActionPreference='Stop'
$package='ru.paseka.journal.archive.restorepicker'
$port=$null
$socket=$null
$cancel=$null
function Phone([string[]]$Arguments){
  $reply=& $AdbPath -d @Arguments
  if($LASTEXITCODE -ne 0){throw ('ADB_FAILED: '+$Arguments[0])}
  return ($reply -join "`n").Trim()
}
$expression=@'
(async () => {
 const database = 'paseka-fileproof335-destination-only-v1';
 if (location.origin !== 'https://localhost' || !document.getElementById('archive') ||
     window.PasekaIsolatedRestore335?.DATABASE !== database) throw Error('WRONG_TEST_PAGE');
 const pins = [
  ['android-proof-black','794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',0],
  ['android-proof-white','bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff',255]
 ];
 if (!(await indexedDB.databases()).some(db => db.name === database && db.version === 1))
  throw Error('RESTORED_DATABASE_REQUIRED');
 const request = req => new Promise((ok,no) => {
  req.onsuccess = () => ok(req.result);
  req.onerror = () => no(Error('DATABASE_READ_FAILED'));
 });
 const open = indexedDB.open(database,1);
 open.onupgradeneeded = () => open.transaction.abort();
 const db = await request(open);
 let rows;
 try {
  const store=db.transaction('entrance_media','readonly').objectStore('entrance_media');
  const [count,...found]=await Promise.all([request(store.count()),...pins.map(([id])=>request(store.get(id)))]);
  if(count!==2) throw Error('UNEXPECTED_VIDEO_COUNT');
  rows=found;
 } finally { db.close(); }
 const frames=[];
 for(const [i,[id,pin,expected]] of pins.entries()){
  const blob=rows[i]?.blob;
  if(!(blob instanceof Blob)||blob.size!==893||blob.type!=='video/mp4') throw Error('UNEXPECTED_BLOB');
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  if(Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')!==pin)
   throw Error('RESTORED_SHA_MISMATCH');
  const video=document.createElement('video'), url=URL.createObjectURL(blob);
  let timer;
  try {
   video.muted=true; video.playsInline=true; video.preload='auto';
   await new Promise((ok,no)=>{
    timer=setTimeout(()=>no(Error('FRAME_TIMEOUT_'+id)),10000);
    video.onloadeddata=ok;
    video.onerror=()=>no(Error('MEDIA_ERROR_'+(video.error?.code||0)+'_'+id));
    video.src=url; video.load();
   });
   if(video.videoWidth!==16 || video.videoHeight!==16) throw Error('FRAME_DIMENSIONS_'+id);
   const canvas=document.createElement('canvas'); canvas.width=16; canvas.height=16;
   const ctx=canvas.getContext('2d'); ctx.fillStyle='magenta'; ctx.fillRect(0,0,16,16);
   ctx.drawImage(video,0,0);
   const pixels=ctx.getImageData(0,0,16,16).data;
   for(let j=0;j<pixels.length;j+=4){
    if(pixels[j+3]!==255||[0,1,2].some(k=>Math.abs(pixels[j+k]-expected)>16)) throw Error('FRAME_COLOR_'+id);
   }
   frames.push(id);
  } finally {
   clearTimeout(timer); video.onloadeddata=null; video.onerror=null;
   video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
  }
 }
 return {status:'PASS',decodedFrames:frames,cleanupAuthorized:false};
})()
'@
try{
 if((Get-FileHash -LiteralPath $AdbPath -Algorithm SHA256).Hash -ne 'bae5ce98846b19caa74a34900850caa8b21d01976932b2ad83baeb5de5651aee'){throw 'ADB_SHA_MISMATCH'}
 if((Phone @('shell','getprop','ro.product.model')) -cne 'NE2213' -or (Phone @('shell','getprop','ro.build.version.sdk')) -cne '36'){throw 'WRONG_DEVICE'}
 $path=Phone @('shell','pm','path',$package)
 if($path -cnotmatch '^package:(/data/app/[A-Za-z0-9_./=~+-]+/base\.apk)$'){throw 'TEST_APK_REQUIRED'}
 $apk=$Matches[1]
 if((Phone @('shell','sha256sum',$apk)).Split(' ')[0] -ne '447362148694101f55ba789ae27b10ca3faf57a1b3b1c07307bf9e7b290ca5d7'){throw 'APK_SHA_MISMATCH'}
 [void](Phone @('shell','am','start','-W','-n',($package+'/.MainActivity')))
 $appPid=Phone @('shell','pidof',$package)
 if($appPid -notmatch '^[1-9][0-9]*$'){throw 'SINGLE_TEST_PROCESS_REQUIRED'}
 $assigned=Phone @('forward','tcp:0',('localabstract:webview_devtools_remote_'+$appPid))
 if($assigned -notmatch '^[0-9]{1,5}$' -or [int]$assigned -lt 1 -or [int]$assigned -gt 65535){throw 'INVALID_FORWARD_PORT'}
 $port=$assigned
 $base="http://127.0.0.1:$port"
 $page=$null
 for($i=0;$i -lt 10;$i++){
  try{
   $raw=(Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -MaximumRedirection 0 -Uri "$base/json/list").Content
   $pages=@((ConvertFrom-Json $raw) | Where-Object {$_.type -eq 'page' -and $_.url -cin @('https://localhost/','https://localhost/index.html')})
   if($pages.Count -eq 1){$page=$pages[0];break}
  }catch{}
  Start-Sleep -Milliseconds 500
 }
 if(!$page){throw 'PINNED_WEBVIEW_PAGE_UNAVAILABLE'}
 $uri=[uri]$page.webSocketDebuggerUrl
 if($uri.Scheme -cne 'ws' -or $uri.Host -notin @('127.0.0.1','localhost') -or $uri.Port -ne [int]$port -or
    $uri.AbsolutePath -cnotmatch '^/devtools/page/[A-Za-z0-9_-]+$' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment){throw 'UNEXPECTED_DEBUG_ENDPOINT'}
 $socket=New-Object Net.WebSockets.ClientWebSocket
 $cancel=New-Object Threading.CancellationTokenSource
 $cancel.CancelAfter(35000)
 $socket.ConnectAsync($uri,$cancel.Token).GetAwaiter().GetResult() | Out-Null
 $json=@{id=1;method='Runtime.evaluate';params=@{expression=$expression;awaitPromise=$true;returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5
 $payload=[Text.Encoding]::UTF8.GetBytes($json)
 $socket.SendAsync([ArraySegment[byte]]::new($payload),[Net.WebSockets.WebSocketMessageType]::Text,$true,$cancel.Token).GetAwaiter().GetResult() | Out-Null
 $buffer=New-Object byte[] 8192
 do{
  $stream=New-Object IO.MemoryStream
  try {
   do{
    $part=$socket.ReceiveAsync([ArraySegment[byte]]::new($buffer),$cancel.Token).GetAwaiter().GetResult()
    if($part.MessageType -ne [Net.WebSockets.WebSocketMessageType]::Text -or $stream.Length+$part.Count -gt 65536){throw 'INVALID_REPLY'}
    $stream.Write($buffer,0,$part.Count)
   }while(!$part.EndOfMessage)
   $msg=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString($stream.ToArray()))
  } finally {$stream.Dispose()}
 }while($msg.id -ne 1)
 if($msg.result.exceptionDetails){throw (([string]$msg.result.exceptionDetails.exception.description -split '[\r\n]')[0])}
 $value=$msg.result.result.value
 if($value.status -cne 'PASS' -or ($value.decodedFrames -join ',') -cne 'android-proof-black,android-proof-white' -or $value.cleanupAuthorized -ne $false){throw 'DECODE_RESULT_UNVERIFIED'}
 Write-Host 'PASS: two restored MP4 frames decoded (black and white).'
}catch{Write-Host ('BLOCKED: '+$_.Exception.Message);exit 2}
finally{
 if($socket){$socket.Dispose()}
 if($cancel){$cancel.Dispose()}
 if($port){& $AdbPath -d forward --remove "tcp:$port" | Out-Null}
}
