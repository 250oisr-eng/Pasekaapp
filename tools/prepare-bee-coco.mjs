// Explicit-use offline YOLO normalized xywh -> COCO annotation converter.
// No training, media upload, model import, backup edits, or deletion.
import {readFile,realpath,mkdir,writeFile,copyFile,mkdtemp,rename,rm,lstat} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,join,dirname} from 'node:path';
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SPLITS=['train','validation','test'];
const fail=msg=>{throw Error(msg)};
const inside=(root,path)=>{const r=relative(root,path);return r!==''&&!r.startsWith('..')&&!r.startsWith('/')&&!r.startsWith('\\')};
const validBox=b=>Array.isArray(b)&&b.length===4&&b.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1)&&b[2]>0&&b[3]>0&&b[0]-b[2]/2>=0&&b[1]-b[3]/2>=0&&b[0]+b[2]/2<=1&&b[1]+b[3]/2<=1;
export function validateManifest(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||data.schemaVersion!==1||
    !ID.test(data.datasetId||'')||!ID.test(data.datasetVersion||'')||
    data.datasetLicenseReviewed!==true||!Array.isArray(data.images)||
    data.images.length<3||data.images.length>10000)fail('manifest_or_license_review_invalid');
 const names=new Set(),paths=new Set(),images=new Set(),videos=new Map(),videoHashes=new Map();
 const result=Object.fromEntries(SPLITS.map(s=>[s,{images:[],annotations:[],categories:[{id:1,name:'bee'}]}]));
 const counts=Object.fromEntries(SPLITS.map(s=>[s,0]));
 for(const item of data.images){
  if(!item||typeof item!=='object'||Array.isArray(item)||!ID.test(item.id||'')||
     !ID.test(item.sourceVideoId||'')||!HEX.test(item.sourceVideoSha256||'')||
     !HEX.test(item.imageSha256||'')||typeof item.path!=='string'||
     !/^images\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png)$/i.test(item.path)||
     item.path.split('/').includes('..')||!SPLITS.includes(item.split)||
     !Number.isSafeInteger(item.width)||item.width<1||item.width>16384||
     !Number.isSafeInteger(item.height)||item.height<1||item.height>16384||
     !Array.isArray(item.boxes)||item.boxes.length>1000||
     item.boxes.some(b=>!validBox(b)))fail('image_or_bbox_invalid');
  if(names.has(item.id)||paths.has(item.path)||images.has(item.imageSha256))fail('duplicate_image');
  names.add(item.id);paths.add(item.path);images.add(item.imageSha256);
  if(videos.has(item.sourceVideoId)&&videos.get(item.sourceVideoId)!==item.split)fail('source_video_split_leakage');
  if(videoHashes.has(item.sourceVideoSha256)&&videoHashes.get(item.sourceVideoSha256)!==item.split)fail('source_video_hash_split_leakage');
  videos.set(item.sourceVideoId,item.split);videoHashes.set(item.sourceVideoSha256,item.split);
  const dest=result[item.split],id=dest.images.length+1;
  dest.images.push({id,file_name:item.path,width:item.width,height:item.height});
  for(const b of item.boxes){
   const x=(b[0]-b[2]/2)*item.width,y=(b[1]-b[3]/2)*item.height;
   const width=b[2]*item.width,height=b[3]*item.height;
   dest.annotations.push({id:dest.annotations.length+1,image_id:id,category_id:1,bbox:[x,y,width,height],area:width*height,iscrowd:0});
  }
  counts[item.split]++;
 }
 if(SPLITS.some(s=>!counts[s]))fail('split_missing');
 return {output:result,counts};
}
export async function prepareDataset({manifestPath,datasetRoot,outputDir}){
 if(!manifestPath||!datasetRoot||!outputDir)fail('paths_required');
 const root=await realpath(datasetRoot),data=JSON.parse(await readFile(manifestPath,'utf8'));
 const prepared=validateManifest(data);
 for(const item of data.images){
  const full=await realpath(resolve(root,item.path));
  if(!inside(root,full))fail('image_path_escape');
  const digest=createHash('sha256').update(await readFile(full)).digest('hex');
  if(digest!==item.imageSha256)fail('image_digest_mismatch');
 }
 const out=resolve(outputDir);
 if(out===root||inside(root,out)||inside(out,root))fail('output_overlaps_dataset');
 // Outputs must be a self-contained COCO package: JSON paths point to copied images.
 // Build in a uniquely owned sibling temp folder, then publish only after all copies
 // and annotation files are prepared. No original file is modified or removed.
 const parent=await realpath(dirname(out));
 if(parent===root||inside(root,parent))fail('output_overlaps_dataset');
 try{await lstat(out);fail('output_already_exists')}catch(e){if(e.message!=='ENOENT'&&e.code!=='ENOENT')throw e}
 const stage=await mkdtemp(join(parent,'.bee-coco-stage-'));
 let published=false;
 try{
  for(const item of data.images){
   const full=await realpath(resolve(root,item.path));
   if(!inside(root,full))fail('image_path_escape');
   const dest=join(stage,item.path);
   await mkdir(dirname(dest),{recursive:true});
   await copyFile(full,dest,fsConstants.COPYFILE_EXCL);
   // Detect a changed original between SHA preflight and copy; never publish
   // an annotation package whose bytes differ from the reviewed manifest.
   const digest=createHash('sha256').update(await readFile(dest)).digest('hex');
   if(digest!==item.imageSha256)fail('image_changed_during_copy');
  }
  for(const split of SPLITS)
   await writeFile(join(stage,split+'.json'),JSON.stringify(prepared.output[split],null,2)+'\n',{flag:'wx'});
  try{await lstat(out);fail('output_already_exists')}catch(e){if(e.message!=='ENOENT'&&e.code!=='ENOENT')throw e}
  await rename(stage,out);
  published=true;
  return {counts:prepared.counts,outputDir:out};
 }finally{if(!published)await rm(stage,{recursive:true,force:true})}

}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 const args=process.argv.slice(2);
 if(args.length!==3){console.error('Usage: node tools/prepare-bee-coco.mjs manifest.json dataset_root output_dir');process.exitCode=2}
 else prepareDataset({manifestPath:args[0],datasetRoot:args[1],outputDir:args[2]})
 .then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1});
}
