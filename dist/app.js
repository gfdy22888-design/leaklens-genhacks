import {sampleData,toCSV,parseCSV,analyze} from './engine.js';
const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(n,d=0)=>n.toLocaleString('en-US',{maximumFractionDigits:d});
const time=t=>new Date(t).toISOString().slice(11,16);
const range=e=>`${time(e.start)}–${time(e.end)} UTC`;
const names={continuous:'Continuous flow',unusual:'Unusual use pattern',quality:'Reading quality'};
const decisions={pending:'Awaiting review',inspect:'Needs inspection',explained:'Explained use',sensor:'Sensor issue'};
let rows=sampleData(),result,selected=null,source={type:'synthetic',label:'Synthetic home · mixed day'},reviews={};
let timer;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,3500);}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function run(){
  try{
    const next=analyze(rows,{baselineMinutes:Number($('baseline').value),sensitivity:Number($('sensitivity').value)});
    result=next;selected=result.events[0]?.id??null;reviews={};$('error').hidden=true;
    $('dataset-label').textContent=source.label;
    $('data-subtitle').textContent=`${number(rows.length)} one-minute readings · ${new Date(rows[0].timestamp).toISOString().slice(0,10)} · UTC`;
    $('source-notice').innerHTML=source.type==='synthetic'?'DEMO DATA <span>All readings are synthetic. An unusual pattern is a reason to investigate, not proof of a leak.</span>':'IMPORTED DATA <span>Processed only in this browser. Check the reference period before interpreting results.</span>';
    $('total').innerHTML=`${number(result.observedLitres,1)}<em>L</em>`;
    $('event-count').innerHTML=`${result.events.length}<em>events</em>`;
    const quality=result.events.filter(e=>e.category==='quality').length;
    $('event-summary').textContent=`${result.events.length-quality} unusual flow · ${quality} data quality`;
    $('coverage').innerHTML=`${((1-result.missingReadings/rows.length)*100).toFixed(1)}<em>%</em>`;
    $('coverage-note').textContent=`${result.missingReadings} missing of ${number(rows.length)} expected readings`;
    $('queue-count').textContent=result.events.length;$('nav-count').textContent=String(result.events.length).padStart(2,'0');
    render();
  }catch(error){$('error').textContent=error.message;$('error').hidden=false;}
}
function render(){drawChart();renderList();renderEvidence();const done=Object.keys(reviews).length;$('review-progress').textContent=`${done} of ${result.events.length} reviewed · export to save`;$('export').disabled=false;}
function drawChart(){
  const width=760,height=230,left=33,right=8,top=22,bottom=28,plotW=width-left-right,plotH=height-top-bottom;
  const max=Math.max(2,...rows.map(r=>r.flow_lpm??0))*1.15;
  const x=i=>left+i/rows.length*plotW,y=v=>top+plotH-v/max*plotH;
  const active=result.events.find(e=>e.id===selected);
  let svg=`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="${left}" y="${top}" width="${result.baselineMinutes/rows.length*plotW}" height="${plotH}" fill="#e8f0e5"/>`;
  for(const e of result.events){const from=result.windows[e.firstWindow].rowStart,to=result.windows[e.lastWindow].rowEnd+1;svg+=`<rect x="${x(from)}" y="${top}" width="${(to-from)/rows.length*plotW}" height="${plotH}" fill="${e.category==='quality'?'#dfdfe5':'#f3d7b6'}" opacity="${active?.id===e.id?'.85':'.45'}"/>`;}
  for(let n=0;n<=4;n++){const value=max*n/4,yy=y(value);svg+=`<line x1="${left}" x2="${width-right}" y1="${yy}" y2="${yy}" stroke="#e7ece2" stroke-width="1"/><text x="${left-8}" y="${yy+3}" text-anchor="end" font-size="9" fill="#9aa491">${value.toFixed(1)}</text>`;}
  let segment=[];
  const emit=()=>{if(segment.length)svg+=`<polyline points="${segment.join(' ')}" fill="none" stroke="#5199a7" stroke-width="1.5" stroke-linejoin="round"/>`;segment=[];};
  rows.forEach((r,i)=>{if(r.flow_lpm===null)emit();else segment.push(`${x(i).toFixed(2)},${y(r.flow_lpm).toFixed(2)}`);});emit();
  for(let t=0;t<=4;t++){const index=Math.min(rows.length-1,Math.floor(rows.length*t/4));svg+=`<text x="${x(index)}" y="${height-7}" text-anchor="${t===4?'end':'middle'}" font-size="9" fill="#9aa491">${time(rows[index].timestamp)}</text>`;}
  svg+='</svg>';$('chart').innerHTML=svg;
  $('chart').setAttribute('aria-label',`Flow in litres per minute. ${result.events.length} review events; reference is the first ${result.baselineMinutes} minutes. ${active?'Selected event: '+names[active.category]+' at '+range(active):''}`);
  $('chart-caption').textContent=`${new Date(rows[0].timestamp).toISOString().slice(0,10)} · UTC${active?' · selected '+range(active):''}`;
}
function renderList(){
  if(!result.events.length){$('event-list').innerHTML='<div class="empty"><strong>No unfamiliar patterns found.</strong>This does not establish that the system is leak-free. Try another scenario or review the reference settings.</div>';return;}
  $('event-list').innerHTML=result.events.map(e=>`<button class="event-card ${e.id===selected?'selected':''}" data-event="${e.id}" aria-pressed="${e.id===selected}"><span class="event-icon ${e.category==='quality'?'quality':''}">${e.category==='quality'?'⊘':'≋'}</span><span><strong>${names[e.category]}</strong><small>${range(e)} · ${e.minutes} min</small><span class="decision">${decisions[reviews[e.id]?.decision??'pending']}</span></span><span class="arrow">↗</span></button>`).join('');
  $('event-list').querySelectorAll('[data-event]').forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.event;render();}));
}
function renderEvidence(){
  const event=result.events.find(e=>e.id===selected);
  if(!event){$('evidence').innerHTML='<div class="empty"><strong>Evidence comes first.</strong>Select a demo scenario or import a CSV to inspect source readings alongside model output.</div>';return;}
  const ws=event.windows.map(i=>result.windows[i]);const first=ws[0];const review=reviews[event.id];
  const description=event.category==='quality'?`${event.missing} missing readings across ${event.minutes} minutes of review windows. Incomplete windows are excluded from model scoring. Recorded volume is a lower bound; it excludes missing minutes.`:event.category==='continuous'?'These complete 15-minute windows contain flow above 0.1 L/min in every minute and differ from the reference. Planned use, a running fixture or a leak could explain this pattern.':'This pattern differs from the selected reference. A change in routine can be legitimate. Compare the readings before deciding whether to inspect.';
  const sourceRows=rows.slice(first.rowStart,result.windows[event.lastWindow].rowEnd+1);
  $('evidence').innerHTML=`<div class="evidence-head"><h3>${names[event.category]}</h3><span class="mini-pill">${event.category==='quality'?'Data quality':'Review suggested'}</span></div><p class="evidence-description">${description}</p><div class="evidence-stats"><div><strong>${number(event.observedLitres,1)} <span class="muted">L</span></strong><small>RECORDED IN EVENT WINDOWS</small></div><div><strong>${event.category==='quality'?'—':number(event.maxScore,2)+'×'}</strong><small>${event.category==='quality'?'NO MODEL SCORE':'MAX DISTANCE / THRESHOLD'}</small></div></div><details open><summary>Window evidence · ${range(event)}</summary><div class="table-scroll"><table><thead><tr><th>UTC window</th><th>Mean L/min</th><th>Active min</th><th>Novelty ratio</th></tr></thead><tbody>${ws.map(w=>`<tr><td>${time(w.start)}–${time(w.end)}</td><td>${number(w.mean,2)}${w.complete?'':'*'}</td><td>${w.onMinutes} / ${w.rowEnd-w.rowStart+1}</td><td>${w.score===null?'Not scored':number(w.score,2)+'×'}</td></tr>`).join('')}</tbody></table></div><p>${event.category==='quality'?'* Mean includes recorded minutes only. Incomplete final windows also receive a quality flag.':'A ratio above 1 means unfamiliar to this reference. It is not a probability or leak severity.'}</p></details><details><summary>Nearest reference matches · first event window</summary><p>${first.neighbours.length?first.neighbours.map(n=>{const w=result.windows[n.windowIndex];return `${time(w.start)}–${time(w.end)} UTC (scaled distance ${n.distance})`;}).join('<br>'):'Unavailable for incomplete windows.'}</p><p>${result.referenceWindows} reference windows · threshold ${result.threshold} · model ${result.modelVersion}</p></details><details><summary>Source readings · ${sourceRows.length} rows</summary><div class="table-scroll"><table><thead><tr><th>UTC timestamp</th><th>Flow L/min</th></tr></thead><tbody>${sourceRows.map(r=>`<tr><td>${escapeHTML(r.timestamp)}</td><td>${r.flow_lpm===null?'Missing':r.flow_lpm}</td></tr>`).join('')}</tbody></table></div></details><form class="review-form" id="review-form"><label for="decision">YOUR REVIEW DECISION</label><select id="decision" required><option value="" disabled ${!review?'selected':''}>Select after inspecting the evidence</option>${Object.entries(decisions).filter(([key])=>key!=='pending').map(([key,value])=>`<option value="${key}" ${review?.decision===key?'selected':''}>${value}</option>`).join('')}</select><label class="sr-only" for="note">Inspection note</label><textarea id="note" maxlength="1000" placeholder="Add context, e.g. planned garden watering…">${escapeHTML(review?.note??'')}</textarea><button class="button primary" type="submit">Save review <span>✓</span></button></form>`;
  $('review-form').addEventListener('submit',ev=>{ev.preventDefault();const decision=$('decision').value;if(!decision)return;reviews[event.id]={decision,note:$('note').value.trim(),reviewedAt:new Date().toISOString()};render();toast('Review saved in this tab. Export evidence to keep a copy.');});
}
$('scenario').addEventListener('change',()=>{const scenario=$('scenario').value;rows=sampleData(scenario);source={type:'synthetic',label:`Synthetic home · ${$('scenario').selectedOptions[0].textContent.toLowerCase()}`};$('baseline').value='360';run();});
for(const id of ['baseline','sensitivity'])$(id).addEventListener('change',()=>{try{analyze(rows,{baselineMinutes:Number($('baseline').value),sensitivity:Number($('sensitivity').value)});run();}catch(e){$('error').textContent=e.message;$('error').hidden=false;$(id).value=id==='baseline'?String(result.baselineMinutes):String(result.sensitivity);}});
$('sample').addEventListener('click',()=>download('leaklens-synthetic-sample.csv',toCSV(sampleData()),'text/csv;charset=utf-8'));
$('csv').addEventListener('change',async()=>{
  const file=$('csv').files[0];if(!file)return;
  try{
    if(file.size>2_000_000)throw new Error('Use a CSV smaller than 2 MB.');
    const incoming=parseCSV(await file.text());
    const baseline=incoming.length>=375?360:60;
    analyze(incoming,{baselineMinutes:baseline,sensitivity:Number($('sensitivity').value)});
    rows=incoming;source={type:'imported',label:file.name};$('baseline').value=String(baseline);run();toast('CSV imported. Choose a reference period you know is routine.');
  }catch(error){$('error').textContent=error.message;$('error').hidden=false;}
  $('csv').value='';
});
$('export').addEventListener('click',()=>{
  const packet={schema:'leaklens-evidence-v1',exportedAt:new Date().toISOString(),source,units:{flow:'L/min',intervalSeconds:60,time:'UTC'},limitations:['Experimental novelty detector, not a leak diagnosis.','Reference selection affects all results; contaminated reference can hide anomalies.','No field validation or verified water savings.','Reviews identify tab actions, not authenticated people.'],model:{version:result.modelVersion,k:3,features:['mean','lower quartile','active-minute ratio','standard deviation'],scaling:'Reference median absolute deviation × 1.4826, with fixed scale floors',thresholdMethod:'max(1.5, 1.5 × reference leave-one-out 95th-percentile distance) / sensitivity',windowMinutes:15},analysis:result,reviews,readings:rows};
  download('leaklens-evidence.json',JSON.stringify(packet,null,2),'application/json');toast('Evidence packet exported, including readings, settings and review decisions.');
});
run();
