// Self-authored tiny ONNX Add(x, bias=2) graph. No third-party weights, no user inputs.
import {writeFileSync} from 'node:fs';
const utf=s=>Buffer.from(s,'utf8');
function v(n){const out=[];while(n>=128){out.push((n&127)|128);n=Math.floor(n/128)}out.push(n);return Buffer.from(out)}
function tag(field,wire){return v(field*8+wire)}
function num(field,value){return Buffer.concat([tag(field,0),v(value)])}
function bin(field,value){const b=Buffer.isBuffer(value)?value:utf(value);return Buffer.concat([tag(field,2),v(b.length),b])}
function f32(field,value){const b=Buffer.alloc(4);b.writeFloatLE(value,0);return Buffer.concat([tag(field,5),b])}
const cat=(...parts)=>Buffer.concat(parts);
const shape=bin(1,num(1,1)); // TensorShapeProto.dim[0].dim_value = 1
const tensorType=cat(num(1,1),bin(2,shape)); // FLOAT32, shape [1]
const type=bin(1,tensorType);
const input=cat(bin(1,'x'),bin(2,type));
const output=cat(bin(1,'y'),bin(2,type));
const bias=cat(num(1,1),num(2,1),f32(4,2),bin(8,'bias'));
const node=cat(bin(1,'x'),bin(1,'bias'),bin(2,'y'),bin(4,'Add'));
const graph=cat(bin(1,node),bin(2,'paseka_synthetic_add_only'),bin(5,bias),bin(11,input),bin(12,output));
const opset=num(2,13);
export const SYNTHETIC_ONNX=cat(num(1,7),bin(2,'paseka_self_authored'),bin(7,graph),bin(8,opset));
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const outputPath=process.argv[2];
 if(!outputPath)throw Error('OUTPUT_PATH_REQUIRED');
 writeFileSync(outputPath,SYNTHETIC_ONNX);
 console.log('SYNTHETIC_ONNX_BYTES',SYNTHETIC_ONNX.length);
}
