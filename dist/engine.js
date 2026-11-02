// LeakLens 0.1: local one-class nearest-neighbour novelty detection.
// A pattern's distance is evidence of novelty, never a probability of a leak.
export const MODEL_VERSION='knn-reference-v1';
export const WINDOW=15;
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[s.length>>1]:(s[s.length/2-1]+s[s.length/2])/2;};
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const quantile=(a,q)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor((s.length-1)*q)];};
const round=(x,n=3)=>Number(x.toFixed(n));
export function sampleData(scenario='mixed'){
  let seed=4261;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const start=Date.parse('2026-11-02T00:00:00Z');
  return Array.from({length:1440},(_,i)=>{
    // Synthetic intermittent fixture use, repeated through the baseline and day.
    let flow=(i%67>=13&&i%67<17)?2.2+random()*2.5:0;
    if((scenario==='mixed'||scenario==='leak')&&i>=800&&i<920)flow+=1.15+random()*.16;
    if((scenario==='mixed'||scenario==='irrigation')&&i>=435&&i<480)flow+=4.2+random()*.2;
    if((scenario==='mixed'||scenario==='gap')&&i>=1090&&i<1110)flow=null;
    return {timestamp:new Date(start+i*60000).toISOString(),flow_lpm:flow===null?null:round(flow)};
  });
}
export function toCSV(rows){return 'timestamp,flow_lpm\n'+rows.map(r=>`${r.timestamp},${r.flow_lpm??''}`).join('\n')+'\n';}
export function parseCSV(text){
  if(typeof text!=='string'||text.length>2_000_000)throw new Error('Use a CSV smaller than 2 MB.');
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(lines[0]?.trim()!=='timestamp,flow_lpm')throw new Error('The header must be timestamp,flow_lpm. Download the sample for the format.');
  if(lines.length<121||lines.length>10081)throw new Error('Provide between 120 and 10,080 one-minute readings.');
  const rows=lines.slice(1).map((line,i)=>{
    const cells=line.split(',');
    if(cells.length!==2)throw new Error(`Row ${i+2}: expected exactly two columns.`);
    const [timestamp,value]=cells.map(s=>s.trim());
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp))throw new Error(`Row ${i+2}: use an ISO timestamp with a time zone.`);
    const time=Date.parse(timestamp);
    const wallTime=Date.parse(timestamp.slice(0,19)+'Z');
    if(!Number.isFinite(wallTime)||new Date(wallTime).toISOString().slice(0,19)!==timestamp.slice(0,19))throw new Error(`Row ${i+2}: invalid calendar date or time.`);
    if(value!==''&&!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))throw new Error(`Row ${i+2}: flow must be a decimal number or blank.`);
    const flow=value===''?null:Number(value);
    if(!Number.isFinite(time)|| (flow!==null&&(!Number.isFinite(flow)||flow<0||flow>1000)))throw new Error(`Row ${i+2}: invalid timestamp or flow (allowed: 0–1000 L/min, or blank).`);
    return {timestamp:new Date(time).toISOString(),flow_lpm:flow};
  });
  rows.forEach((r,i)=>{if(i&&Date.parse(r.timestamp)-Date.parse(rows[i-1].timestamp)!==60000)throw new Error(`Row ${i+2}: timestamps must be increasing at exactly one-minute intervals. Insert blank flow values for missing minutes.`);});
  return rows;
}
export function windowsOf(rows){
  const windows=[];
  for(let i=0;i<rows.length;i+=WINDOW){
    const chunk=rows.slice(i,i+WINDOW),values=chunk.map(r=>r.flow_lpm).filter(x=>x!==null);
    const complete=values.length===WINDOW&&chunk.length===WINDOW;
    const avg=values.length?mean(values):0;
    const on=values.filter(x=>x>.1).length;
    const sd=values.length?Math.sqrt(mean(values.map(x=>(x-avg)**2))):0;
    windows.push({index:windows.length,start:chunk[0].timestamp,end:new Date(Date.parse(chunk.at(-1).timestamp)+60000).toISOString(),rowStart:i,rowEnd:i+chunk.length-1,complete,missing:chunk.length-values.length,partial:chunk.length<WINDOW,volume:round(values.reduce((s,x)=>s+x,0)),features:complete?[avg,quantile(values,.25),on/WINDOW,sd]:null,mean:round(avg),min:values.length?Math.min(...values):null,onMinutes:on});
  }
  return windows;
}
function distance(a,b,scales){return Math.sqrt(a.reduce((sum,x,j)=>sum+((x-b[j])/scales[j])**2,0)/a.length);}
function nearest(features,reference,scales,exclude=-1){
  const matches=reference.map((w,i)=>({i,distance:distance(features,w.features,scales)})).filter(x=>x.i!==exclude).sort((a,b)=>a.distance-b.distance);
  return {distance:mean(matches.slice(0,3).map(x=>x.distance)),matches:matches.slice(0,3).map(x=>({windowIndex:reference[x.i].index,distance:round(x.distance)}))};
}
export function analyze(rows,{baselineMinutes=360,sensitivity=1}={}){
  if(!Array.isArray(rows)||rows.length<120)throw new Error('At least 120 one-minute readings are required.');
  if(!Number.isInteger(baselineMinutes)||baselineMinutes<60||baselineMinutes%15!==0||baselineMinutes>rows.length-15)throw new Error('Choose a baseline of complete 15-minute windows, leaving at least one later window.');
  if(!Number.isFinite(sensitivity)||sensitivity<.5||sensitivity>2)throw new Error('Sensitivity must be between 0.5 and 2.');
  const windows=windowsOf(rows);
  const reference=windows.filter(w=>w.rowEnd<baselineMinutes&&w.complete);
  if(reference.length<4)throw new Error('The baseline needs at least four complete 15-minute windows. Choose a longer or cleaner reference.');
  const floor=[.3,.2,.12,.4];
  const scales=floor.map((f,j)=>Math.max(f,median(reference.map(w=>Math.abs(w.features[j]-median(reference.map(v=>v.features[j])))))*1.4826));
  const loo=reference.map((w,i)=>nearest(w.features,reference,scales,i).distance);
  const threshold=Math.max(1.5,quantile(loo,.95)*1.5)/sensitivity;
  for(const w of windows){
    w.baseline=w.rowEnd<baselineMinutes;
    if(!w.complete){w.kind='quality';w.score=null;w.neighbours=[];continue;}
    const match=nearest(w.features,reference,scales);
    w.score=round(match.distance/threshold);w.neighbours=match.matches;
    w.kind=w.baseline?'reference':w.score>1?'unusual':'normal';
  }
  const events=[];
  for(const w of windows.filter(w=>!w.baseline&&(w.kind==='quality'||w.kind==='unusual'))){
    const category=w.kind==='quality'?'quality':w.onMinutes===WINDOW&&w.min>.1?'continuous':'unusual';
    const previous=events.at(-1);
    if(previous&&previous.category===category&&previous.lastWindow+1===w.index){previous.lastWindow=w.index;previous.end=w.end;previous.windows.push(w.index);}
    else events.push({id:`event-${w.index}`,category,start:w.start,end:w.end,firstWindow:w.index,lastWindow:w.index,windows:[w.index]});
  }
  for(const e of events){const ws=e.windows.map(i=>windows[i]);e.minutes=ws.reduce((s,w)=>s+w.rowEnd-w.rowStart+1,0);e.observedLitres=round(ws.reduce((s,w)=>s+w.volume,0),1);e.maxScore=Math.max(...ws.map(w=>w.score??0));e.missing=ws.reduce((s,w)=>s+w.missing,0);e.review='pending';}
  return {modelVersion:MODEL_VERSION,baselineMinutes,sensitivity,threshold:round(threshold),scales:scales.map(x=>round(x)),referenceWindows:reference.length,readingCount:rows.length,observedLitres:round(rows.reduce((s,r)=>s+(r.flow_lpm??0),0),1),missingReadings:rows.filter(r=>r.flow_lpm===null).length,windows,events};
}
