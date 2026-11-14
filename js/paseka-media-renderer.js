(function (root) {
'use strict';

const DATA_IMAGE=/^data:image\/(?:jpeg|png|gif|webp|avif|bmp|heic|heif);base64,[a-z0-9+/]+={0,2}$/i;

function fail(code,message){
  const error=new Error(message||code);
  error.code=code;
  throw error;
}
function safeLegacyImage(value){
  return typeof value==='string'&&value.length<=36*1024*1024&&DATA_IMAGE.test(value);
}
function create(options={}){
  const mediaStore=options.mediaStore||root.PasekaMediaStore;
  const urlApi=options.urlApi||root.URL;
  const ownedUrls=new Set();
  const elementUrls=new WeakMap();
  const renderTokens=new WeakMap();

  async function resolveImage(media,db,cryptoProvider){
    if(!media||typeof media!=='object')return {status:'missing',src:null,reason:'INVALID_MEDIA_RECORD'};
    if(media.storage==='indexeddb-blob-v1'||media.blobId!=null){
      if(typeof media.blobId!=='string'||!media.blobId.trim()||media.blobId.length>128){
        return fallback(media,'INVALID_MEDIA_ID');
      }
      if(!mediaStore||typeof mediaStore.getImage!=='function')return fallback(media,'MEDIA_STORE_UNAVAILABLE');
      try{
        const record=await mediaStore.getImage(db,media.blobId,cryptoProvider);
        if(!record)return fallback(media,'MEDIA_BLOB_MISSING');
        if(!record.blob||typeof record.blob.arrayBuffer!=='function')return fallback(media,'MEDIA_BLOB_INVALID');
        if(!urlApi||typeof urlApi.createObjectURL!=='function'||typeof urlApi.revokeObjectURL!=='function'){
          return fallback(media,'OBJECT_URL_UNAVAILABLE');
        }
        const src=urlApi.createObjectURL(record.blob);
        ownedUrls.add(src);
        return {status:'ready',src,storage:'indexeddb-blob-v1',fallback:false};
      }catch(error){
        return fallback(media,error?.code||'MEDIA_READ_FAILED');
      }
    }
    if(safeLegacyImage(media.data))return {status:'ready',src:media.data,storage:'data-url',fallback:false};
    return {status:'missing',src:null,reason:'UNSUPPORTED_OR_MISSING_IMAGE'};
  }
  function fallback(media,reason){
    if(safeLegacyImage(media?.data)){
      return {status:'ready',src:media.data,storage:'data-url',fallback:true,reason};
    }
    return {status:'missing',src:null,reason};
  }
  async function hydrate(container,items,db,cryptoProvider){
    if(!container||typeof container.querySelectorAll!=='function')return 0;
    const token={};renderTokens.set(container,token);
    const nodes=Array.from(container.querySelectorAll('img[data-media-index]'));
    let hydrated=0;
    for(const node of nodes){
      const index=Number(node.getAttribute('data-media-index'));
      const media=Number.isInteger(index)&&index>=0?items?.[index]:null;
      const result=await resolveImage(media,db,cryptoProvider);
      if(renderTokens.get(container)!==token)return hydrated;
      const old=elementUrls.get(node);
      if(old){release(old);elementUrls.delete(node)}
      if(result.status==='ready'){
        node.src=result.src;
        if(result.storage==='indexeddb-blob-v1')elementUrls.set(node,result.src);
        node.removeAttribute('data-media-index');
        hydrated++;
      }else{
        node.removeAttribute('src');
        node.alt='Фотография недоступна';
        node.classList.add('media-unavailable');
        node.removeAttribute('data-media-index');
      }
    }
    return hydrated;
  }
  function releaseContainer(container){
    if(!container||typeof container.querySelectorAll!=='function')return 0;
    renderTokens.set(container,{});
    let released=0;
    for(const node of container.querySelectorAll('img')){
      const src=elementUrls.get(node);
      if(src&&release(src))released++;
      elementUrls.delete(node);
    }
    return released;
  }
  function release(src){
    if(typeof src!=='string'||!ownedUrls.has(src))return false;
    ownedUrls.delete(src);
    urlApi.revokeObjectURL(src);
    return true;
  }
  function releaseAll(){
    for(const src of ownedUrls)urlApi.revokeObjectURL(src);
    const count=ownedUrls.size;
    ownedUrls.clear();
    return count;
  }
  return Object.freeze({resolveImage,hydrate,releaseContainer,release,releaseAll,get activeObjectUrlCount(){return ownedUrls.size}});
}
const api=Object.freeze({safeLegacyImage,create});
root.PasekaMediaRenderer=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
