import { AutoModelForCausalLM, AutoTokenizer, Tensor, env } from '@huggingface/transformers';
import { readFileSync } from 'node:fs';
env.cacheDir='/tmp/opencode/.hf-cache';
const ID='onnx-community/Qwen2.5-0.5B';
const tok=await AutoTokenizer.from_pretrained(ID);
const model=await AutoModelForCausalLM.from_pretrained(ID,{dtype:'q8',session_options:{intraOpNumThreads:1,interOpNumThreads:1}});
console.error('modèle prêt');

function distsFromLogits(data,dims,ids,temp){
  const seq=dims[1], vocab=dims[2];
  const dists=[];
  for(let t=0;t<seq-1;t++){
    const off=t*vocab; const row=new Float64Array(vocab);
    let max=-1e9; for(let v=0;v<vocab;v++){const z=data[off+v]/temp; if(z>max)max=z;}
    let sum=0; for(let v=0;v<vocab;v++){const e=Math.exp(data[off+v]/temp-max); row[v]=e; sum+=e;}
    let acc=0; const cdf=new Float64Array(vocab);
    for(let v=0;v<vocab;v++){acc+=row[v]/sum; cdf[v]=acc;}
    dists.push(cdf);
  }
  return dists;
}
function logpOf(data,dims,ids){
  const seq=dims[1], vocab=dims[2]; let lp=0;
  for(let t=1;t<seq;t++){
    const cur=ids[t], off=(t-1)*vocab;
    let max=-1e9; for(let v=0;v<vocab;v++){const z=data[off+v]; if(z>max)max=z;}
    let sum=0; for(let v=0;v<vocab;v++) sum+=Math.exp(data[off+v]-max);
    lp+=data[off+cur]-max-Math.log(sum);
  }
  return lp;
}
function sample(cdf){ let r=Math.random(); let lo=0,hi=cdf.length-1; while(lo<hi){const m=(lo+hi)>>1; if(cdf[m]<r)lo=m+1;else hi=m;} return lo; }

async function curvature(text,k=8){
  const enc=await tok(text.slice(0,500),{truncation:true,max_length:140});
  const ids=Array.from(enc.input_ids.data).map(Number);
  const out=await model(enc);
  const lpOrig=logpOf(out.logits.data,out.logits.dims,ids);
  const dists=distsFromLogits(out.logits.data,out.logits.dims,ids,1.0);
  const samples=[];
  for(let i=0;i<k;i++){
    const alt=ids.slice(); for(let t=0;t<dists.length;t++) alt[t+1]=sample(dists[t]);
    const t2=new Tensor('int64', BigInt64Array.from(alt.map(BigInt)), [1, alt.length]);
    const mask=new Tensor('int64', BigInt64Array.from(alt.map(()=>1n)), [1, alt.length]);
    const pos=new Tensor('int64', BigInt64Array.from(alt.map((_,i)=>BigInt(i))), [1, alt.length]);
    const out2=await model({ input_ids: t2, attention_mask: mask, position_ids: pos });
    samples.push(logpOf(out2.logits.data,out2.logits.dims,alt));
  }
  const mu=samples.reduce((a,b)=>a+b,0)/samples.length;
  const sd=Math.sqrt(samples.reduce((a,b)=>a+(b-mu)**2,0)/samples.length)||1;
  return {lp:lpOrig/k, mu:mu/k, d:(lpOrig-mu)/sd};
}
async function run(tag,label,text){ const r=await curvature(text); console.log(`${tag.padEnd(6)} ${label.padEnd(22)} logp/tok=${(r.lp).toFixed(2).padStart(7)}  E[sample]=${(r.mu).toFixed(2).padStart(7)}  d=${r.d.toFixed(2).padStart(6)}`); }
console.log('\n=== COURBURE (Fast-DetectGPT simplifié, k=8) ===');
await run('IA','fr judaisme', readFileSync('/tmp/opencode/bench/ai-fr.txt','utf8'));
await run('IA','en', readFileSync('/tmp/opencode/bench/ai-en.txt','utf8'));
await run('HUMAIN','fr familier', readFileSync('/tmp/opencode/bench/hu-fr.txt','utf8'));
await run('HUMAIN','Wikipedia fr', readFileSync('/tmp/opencode/wiki/fr.txt','utf8'));
await run('HUMAIN','Wikipedia en', readFileSync('/tmp/opencode/wiki/en.txt','utf8'));
