// Incremental, bounded-memory summary of a Jev player's append-only JSONL trace.
// The live dashboard consumes each complete event once instead of repeatedly
// downloading and reparsing the entire run log.
const DECISIONS=new Set(['jev-decision','local-decision','jev']);
const RECENT=new Set([...DECISIONS,'jev-error','local-error']);
const MAX_RESPONSE_SAMPLES=4096,MAX_PENDING_FORMS=100;

const timeOf=value=>{const at=Date.parse(value||'');return Number.isFinite(at)?at:null};

export class JevEventMonitor {
  constructor(){this.reset()}

  reset(){
    this.gates=new Map();this.responseMs=[];this.responseCount=0;this.recentRows=[];
    this.dragonOffers=0;this.dragonSelections=0;this.dragonFormDispatches=0;
    this.dragonFormInferred=0;this.dragonRtRefusals=0;
    this.pendingForms=[];this.lastDragonSelection=null;
    this.harvestedCounts={};this.soldCounts={};
  }

  ingest(event){
    if(!event||typeof event!=='object')return;
    if(RECENT.has(event.type)){
      this.recentRows.push(event);if(this.recentRows.length>10)this.recentRows.shift();
    }
    if(/^(local|jev)-response$/.test(event.type)&&Number.isFinite(Number(event.elapsedMs))){
      this.responseCount++;this.responseMs.push(Number(event.elapsedMs));
      if(this.responseMs.length>MAX_RESPONSE_SAMPLES)this.responseMs.shift();
    }
    if(DECISIONS.has(event.type)){
      this.#observeGate(event);
      if(event.state?.inCombat&&event.options?.some(option=>option.id==='ability_dragon'))
        this.dragonOffers++;
      if(event.state?.inCombat&&event.id==='ability_dragon')this.dragonSelections++;
      this.#observeForms(event);
      if(event.id==='ability_dragon'&&Number.isFinite(Number(event.state?.innerFire)))
        this.lastDragonSelection={at:timeOf(event.ts),innerFire:Number(event.state.innerFire)};
    }else if(event.type==='execution'&&event.command==='form dragon'){
      this.dragonFormDispatches++;
      const at=timeOf(event.ts),selection=this.lastDragonSelection;
      if(at!==null&&selection?.at!==null&&selection?.at!==undefined
          &&at>=selection.at&&at-selection.at<=2_000)
        this.pendingForms.push({at,before:selection.innerFire});
      if(this.pendingForms.length>MAX_PENDING_FORMS)this.pendingForms.shift();
    }else if(event.type==='action-deferred'&&event.id==='ability_dragon'
        &&event.reason==='roundtime')this.dragonRtRefusals++;
    else if(event.type==='loot-harvested'){
      for(const item of event.items||[])this.harvestedCounts[item]=(this.harvestedCounts[item]||0)+1;
    }else if(event.type==='loot-sold'&&event.item){
      this.soldCounts[event.item]=(this.soldCounts[event.item]||0)+(Number(event.quantity)||1);
    }
  }

  #observeForms(event){
    const at=timeOf(event.ts),innerFire=Number(event.state?.innerFire);
    if(at===null||!Number.isFinite(innerFire))return;
    const pending=[];
    for(const form of this.pendingForms){
      const age=at-form.at;
      if(age<0||age>10_000)continue;
      this.dragonFormInferred+=form.before-innerFire>=15?1:0;
    }
    this.pendingForms=pending;
  }

  #observeGate(event){
    const requirements=event.state?.requirements;
    if(!Array.isArray(requirements?.rows))return;
    const circle=String(requirements.circle??'unknown');
    let group=this.gates.get(circle);
    if(!group){group={circle:requirements.circle??null,snapshots:0,firstAt:event.ts||null,
      lastAt:event.ts||null,rows:new Map()};this.gates.set(circle,group)}
    group.snapshots++;group.lastAt=event.ts||group.lastAt;
    for(const row of requirements.rows){
      const label=String(row.label||'unlabeled'),have=Number(row.have)||0,need=Number(row.need)||0;
      let timeline=group.rows.get(label);
      if(!timeline){timeline={label,firstHave:have,latestHave:have,firstNeed:need,need,firstClosedAt:null};group.rows.set(label,timeline)}
      timeline.latestHave=have;timeline.need=need;
      if(timeline.firstClosedAt===null&&need>0&&have>=need)timeline.firstClosedAt=event.ts||null;
    }
  }

  snapshot(){
    const gateHistory=[...this.gates.values()].map(group=>({circle:group.circle,
      snapshots:group.snapshots,firstAt:group.firstAt,lastAt:group.lastAt,
      rows:[...group.rows.values()].map(row=>({...row,
        delta:row.latestHave-row.firstHave,
        closedDuringRun:Boolean(row.firstClosedAt&&row.firstHave<row.firstNeed),
        closedAt:row.firstClosedAt}))}));
    return {gateHistory,responseMs:[...this.responseMs],responseCount:this.responseCount,
      recentRows:[...this.recentRows],
      dragonOffers:this.dragonOffers,dragonSelections:this.dragonSelections,
      dragonFormDispatches:this.dragonFormDispatches,dragonFormInferred:this.dragonFormInferred,
      dragonRtRefusals:this.dragonRtRefusals,harvestedCounts:{...this.harvestedCounts},
      soldCounts:{...this.soldCounts}};
  }
}

export class JevEventTraceTail {
  constructor(monitor){this.monitor=monitor;this.reset()}

  reset(){this.offset=0;this.carry='';this.decoder=new TextDecoder()}

  append(bytes){
    const chunk=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    this.offset+=chunk.byteLength;
    const parts=(this.carry+this.decoder.decode(chunk,{stream:true})).split(/\r?\n/);
    this.carry=parts.pop()||'';
    let parsed=0;
    for(const line of parts){
      if(!line)continue;
      try{this.monitor.ingest(JSON.parse(line));parsed++}catch{}
    }
    return parsed;
  }
}

export class JevEventTraceReader {
  constructor(monitor,fetcher=(...args)=>fetch(...args)){
    this.monitor=monitor;this.fetcher=fetcher;this.runId=null;this.tail=new JevEventTraceTail(monitor);
  }

  reset(runId=null){this.monitor.reset();this.tail.reset();this.runId=runId}

  async refresh(runId,url){
    if(this.runId!==runId)this.reset(runId);
    const head=await this.fetcher(url,{method:'HEAD',cache:'no-store'});
    if(!head.ok)throw new Error(`Event trace HTTP ${head.status}`);
    const size=Number(head.headers.get('content-length'));
    if(Number.isFinite(size)&&size<this.tail.offset)this.reset(runId);
    if(Number.isFinite(size)&&size===this.tail.offset)return this.monitor.snapshot();
    const response=await this.fetcher(url,{headers:{Range:`bytes=${this.tail.offset}-`},cache:'no-store'});
    if(response.status===416)return this.monitor.snapshot();
    if(response.status!==206&&response.status!==200)
      throw new Error(`Event tail HTTP ${response.status}`);
    if(response.status===200)this.reset(runId);
    this.tail.append(new Uint8Array(await response.arrayBuffer()));
    return this.monitor.snapshot();
  }
}
