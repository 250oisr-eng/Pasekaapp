import {Transform} from 'node:stream';
// Exact base64 body with optional Android line breaks. Never permit arbitrary
// console text, ANSI sequences, inserted bytes or data after padding.
export class StrictBase64Decoder extends Transform {
 constructor(){
  super();this.pending='';this.finished=false;this.encodedBytes=0;
 }
 _transform(chunk,_encoding,callback){
  try{
   this.encodedBytes+=chunk.length;
   let input=this.pending+chunk.toString('latin1').replace(/[\r\n]/g,'');
   if(!/^[A-Za-z0-9+/=]*$/.test(input))throw Error('BASE64_TRANSPORT_INVALID_CHAR');
   if(this.finished){
    if(input.length)throw Error('BASE64_TRANSPORT_AFTER_PADDING');
    this.pending='';callback();return;
   }
   const padded=input.indexOf('=');
   if(padded!==-1){
    const tail=input.slice(padded);
    if(!/^={1,2}$/.test(tail) ||input.length%4!==0)
      throw Error('BASE64_TRANSPORT_PADDING_INVALID');
    const data=Buffer.from(input,'base64');
    if(data.toString('base64')!==input)throw Error('BASE64_TRANSPORT_NONCANONICAL');
    this.push(data);this.pending='';this.finished=true;
   } else{
    const usable=Math.floor(input.length/4)*4;
    if(usable){
     const block=input.slice(0,usable);
     const data=Buffer.from(block,'base64');
     if(data.toString('base64')!==block)throw Error('BASE64_TRANSPORT_NONCANONICAL');
     this.push(data);
    }
    this.pending=input.slice(usable);
   }
   callback();
  }catch{callback(Error('BASE64_TRANSPORT_CORRUPTED'));}
 }
 _flush(callback){
  if(this.pending.length!==0||this.encodedBytes===0)
   callback(Error('BASE64_TRANSPORT_TRUNCATED'));
  else callback();
 }
}
