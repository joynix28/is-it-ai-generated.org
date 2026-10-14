import { AutoModelForCausalLM, AutoTokenizer, env } from '@huggingface/transformers';
import { readFileSync, readdirSync } from 'node:fs';
env.cacheDir='/tmp/opencode/.hf-cache';
const ID='onnx-community/Qwen2.5-0.5B';
const tok=await AutoTokenizer.from_pretrained(ID);
const model=await AutoModelForCausalLM.from_pretrained(ID,{dtype:'q8',session_options:{intraOpNumThreads:1,interOpNumThreads:1}});
console.error('modèle prêt');
async function ppl(text){
  const enc=await tok(text.slice(0,1400),{truncation:true,max_length:300});
  const out=await model(enc);
  const {logits}=out, data=logits.data, dims=logits.dims, seq=dims[1], vocab=dims[2];
  const ids=Array.from(enc.input_ids.data).map(Number);
  const nll=[];
  for(let t=1;t<seq;t++){
    const cur=ids[t], off=(t-1)*vocab;
    let max=-1e9; for(let v=0;v<vocab;v++){const z=data[off+v]; if(z>max)max=z;}
    let sum=0; for(let v=0;v<vocab;v++) sum+=Math.exp(data[off+v]-max);
    nll.push(-(data[off+cur]-max-Math.log(sum)));
  }
  const mean=nll.reduce((a,b)=>a+b,0)/nll.length;
  const varr=nll.reduce((a,b)=>a+(b-mean)**2,0)/nll.length;
  return {ppl:Math.exp(mean),var:varr,cv:Math.sqrt(varr)/mean,n:nll.length};
}
function line(tag,label,r){ console.log(`${tag.padEnd(6)} ${label.padEnd(26)} ppl=${r.ppl.toFixed(1).padStart(7)}  var=${r.var.toFixed(2).padStart(6)}  cv=${r.cv.toFixed(3)}  n=${r.n}`); }
console.log('\n=== IA vs HUMAIN (banc) ===');
for(const lang of ['fr','es','de','ru','zh','ar','en']){
  line('IA', lang+' bench', await ppl(readFileSync(`/tmp/opencode/bench/ai-${lang}.txt`,'utf8')));
  line('HUMAIN', lang+' bench', await ppl(readFileSync(`/tmp/opencode/bench/hu-${lang}.txt`,'utf8')));
}
console.log('\n=== HUMAIN réel : Wikipedia ===');
for(const f of readdirSync('/tmp/opencode/wiki')){
  const lang=f.replace('.txt','');
  line('HUMAIN','Wikipedia '+lang, await ppl(readFileSync('/tmp/opencode/wiki/'+f,'utf8')));
}
