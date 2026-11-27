/* QA-only Android SAF export. Included only in disposable .qa.archive APK.
 * Never uploads or mutates IndexedDB. A successful response means native readback
 * matched the original bytes; external copy and independent restore remain unproved. */
(function(root){
  'use strict';
  function hex(bytes){return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');}
  function encodeChunk(bytes){
    let out='';
    for(let i=0;i<bytes.length;i++)out+=String.fromCharCode(bytes[i]);
    return btoa(out);
  }
  async function saveArchive(raw,name){
    if(typeof raw!=='string'||!/^paseka-full-idb-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      throw Error('QA_SAF_BLOCKED: invalid archive data or filename');
    const capacitor=root.Capacitor;
    if(!capacitor?.isNativePlatform?.()||typeof capacitor.registerPlugin!=='function')
      throw Error('QA_SAF_BLOCKED: Android native bridge unavailable; no file was saved');
    if(!root.crypto?.subtle)throw Error('QA_SAF_BLOCKED: SHA-256 unavailable');
    const bytes=new TextEncoder().encode(raw);
    if(bytes.length===0||bytes.length>256*1024*1024)
      throw Error('QA_SAF_BLOCKED: archive must be between 1 byte and 256 MiB');
    const digest=hex(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)));
    const native=capacitor.registerPlugin('PasekaSafExport');
    let begun=false;
    try{
      await native.begin({name,byteLength:bytes.length,sha256:digest});begun=true;
      for(let offset=0;offset<bytes.length;offset+=48*1024){
        const part=bytes.subarray(offset,Math.min(offset+48*1024,bytes.length));
        await native.append({chunk:encodeChunk(part)});
      }
      const result=await native.finish();
      if(result?.sha256!==digest||result?.byteLength!==bytes.length||result?.fileName!==name)
        throw Error('QA_SAF_BLOCKED: saved file readback does not match exact input');
      return {sha256:digest,byteLength:bytes.length,fileName:name,readbackVerified:true};
    }catch(error){
      if(begun)try{await native.abort();}catch(_){}
      throw error;
    }
  }
  root.PasekaSafExport={saveArchive};
})(window);
