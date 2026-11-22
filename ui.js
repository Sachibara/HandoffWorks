const get = id => document.getElementById(id);
const roles = [
  ['Intake analyst','Indexes source statements and removes exact duplicates.'],
  ['Commitment tracker','Collects actions and decisions with their source references.'],
  ['Risk reviewer','Surfaces blockers and unresolved questions.'],
  ['Handoff editor','Compiles the reviewed evidence into a portable brief.']
];
const desks = roles.map(([name,job]) => {
  const desk=document.createElement('article');desk.className='desk';
  const title=document.createElement('h3'),detail=document.createElement('small'),state=document.createElement('b'),list=document.createElement('ul');
  title.textContent=name;detail.textContent=job;state.textContent='Ready';
  desk.append(title,detail,document.createElement('br'),state,list);get('desks').append(desk);
  return {desk,state,list};
});
function display(i,state,lines=[]){
  const d=desks[i];d.state.textContent=state;d.desk.classList.toggle('active',state==='Working');d.list.replaceChildren();
  for(const text of lines){const li=document.createElement('li');li.textContent=text;d.list.append(li)}
}
const labels=['Action','Decision','Blocker','Question','Context'];
const examples=['Someone has a commitment, deliverable or next action.','The team made a decision or approved a choice.','A dependency, delay, failure or risk blocks delivery.','An open question needs an answer or clarification.','General background information or a status observation.'];
let modelPromise;
async function routeWithAI(lines){
  if(!modelPromise) modelPromise=(async()=>{
    const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js');
    env.allowLocalModels=false;
    const encoder=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8',device:'wasm'});
    const embed=async texts=>(await encoder(texts,{pooling:'mean',normalize:true})).tolist();
    return {embed,anchors:await embed(examples)};
  })().catch(err=>{modelPromise=null;throw err});
  const {embed,anchors}=await modelPromise;
  let tags=[];
  for(let i=0;i<lines.length;i+=8){
    const vectors=await embed(lines.slice(i,i+8));
    for(const v of vectors){
      const scores=anchors.map(a=>a.reduce((s,x,j)=>s+x*v[j],0));const best=Math.max(...scores);
      tags.push(best<0.2?'Context':labels[scores.indexOf(best)]);
    }
  }
  return tags;
}
function rules(s){
  if(/\?|\b(unclear|who owns|need clarification)\b/i.test(s))return 'Question';
  if(/\b(blocked|blocking|blocker|waiting|missing|risk|failed|delayed|cannot)\b/i.test(s))return 'Blocker';
  if(/\b(decided|approved|agreed|selected)\b/i.test(s))return 'Decision';
  if(/\b(will|must|todo|to-do|needs? to|assigned|ship|deliver|prepare)\b/i.test(s))return 'Action';
  return 'Context';
}
let packet='';
function reset(){packet='';get('report').textContent='Run a brief to generate the delivery handoff.';get('download').disabled=get('print').disabled=true;desks.forEach((_,i)=>display(i,'Ready'));get('status').textContent=''}
get('brief').oninput=reset;get('ai').onchange=reset;
get('example').onclick=()=>{if(get('brief').value.trim()&&!confirm('Replace these notes with the sample brief?'))return;get('brief').value='Nina will prepare the release checklist by Thursday.\nCheckout testing is blocked by missing sandbox credentials.\nThe client approved a phased rollout.\nWho owns support coverage this weekend?\nNina will prepare the release checklist by Thursday.';reset()};
const paint=()=>new Promise(resolve=>setTimeout(resolve,0));
get('run').onclick=async()=>{
  reset();const input=get('brief').value.trim();
  const raw=input.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).map(s=>s.trim()).filter(Boolean);
  if(!raw.length||raw.length>150){get('status').textContent='Enter between 1 and 150 statements.';return}
  const controls=['run','brief','example','ai'];controls.forEach(k=>get(k).disabled=true);
  try{
    display(0,'Working');await paint();
    const lines=[...new Set(raw)],refs=lines.map((s,i)=>'['+(i+1)+'] '+s);
    display(0,'Complete',[lines.length+' unique statements',raw.length-lines.length+' duplicates removed']);
    display(1,'Working');await paint();
    let tags,mode='Rule-based routing';
    if(get('ai').checked){
      get('status').textContent='Loading the local model and routing statements…';
      try{const inferred=await routeWithAI(lines);
        tags=lines.map((line,i)=>{const explicit=rules(line);return explicit==='Context'?inferred[i]:explicit});
        mode='Local AI routing with explicit action and risk checks'}catch{mode='Rule-based routing (local AI unavailable)'}
    }
    tags??=lines.map(rules);
    const group=name=>refs.filter((_,i)=>tags[i]===name);
    const actions=group('Action'),decisions=group('Decision'),risks=group('Blocker'),questions=group('Question');
    display(1,'Complete',[...actions.map(s=>'Action '+s),...decisions.map(s=>'Decision '+s)]);
    display(2,'Working');await paint();display(2,'Complete',[...risks.map(s=>'Blocker '+s),...questions.map(s=>'Question '+s)]);
    display(3,'Working');await paint();
    packet=['Delivery handoff',mode,...labels.map(k=>k+'\n'+(group(k).join('\n')||'None identified.'))].join('\n\n');
    get('report').textContent=packet;display(3,'Complete',[lines.length+' source statements included','Ready to export']);
    get('status').textContent=mode+'. Review the classifications before sharing.';get('print').disabled=get('download').disabled=false;
  }catch{get('status').textContent='Could not finish this run. Please retry.'}
  finally{controls.forEach(k=>get(k).disabled=false)}
};
get('print').onclick=()=>window.print();
get('download').onclick=()=>{const url=URL.createObjectURL(new Blob([packet],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='delivery-handoff.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
