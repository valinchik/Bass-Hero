const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const STRINGS = ["E","A","D","G"];
const TOP_STRINGS = ["G","D","A","E"];
const OPEN_HZ = {E:41.2034,A:55,D:73.4162,G:97.9989};
const DEFAULT_AI = () => ({tests:0,lastAccuracy:0,strings:{E:{offsetCents:0,samples:0,meanAbsError:0,errors:0},A:{offsetCents:0,samples:0,meanAbsError:0,errors:0},D:{offsetCents:0,samples:0,meanAbsError:0,errors:0},G:{offsetCents:0,samples:0,meanAbsError:0,errors:0}}});
function readJSON(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||"null");return v===null?fallback():v;}catch(_){return fallback();}}
const state = {
  song:null,playing:false,waiting:false,previewing:false,previewStartedAt:0,previewTimer:0,
  currentBeat:0,startBeat:0,startAt:0,raf:0,countdownTimer:0,currentIndex:0,
  hits:0,misses:0,wrongCounted:false,playedSeconds:0,sessionStartedAt:0,lastSavedAt:0,
  speed:1,playMode:"wait",soundMode:"original",countdown:5,musicVolume:.65,guideVolume:.15,previewPreviousMode:"wait",
  savedTabs:readJSON("bh-saved-tabs",()=>[]),songStats:readJSON("bh-song-stats",()=>({})),
  progress:readJSON("bh-song-progress",()=>({})),globalStats:readJSON("bh-global-stats",()=>({completed:0,hits:0,misses:0,seconds:0})),
  aiProfile:readJSON("bh-ai-profile",DEFAULT_AI),audioSources:{},audioElement:null,audioUrl:null,audioContext:null,lastSynthStep:-1,guidePlayed:new Set(),
  micStream:null,micContext:null,micFrame:0,micEnabled:false,micStarting:false,micRequestId:0,lastDetectedAt:0,micTestActive:false,micTestIndex:0,micTestResults:[],micTestHistory:readJSON("bh-mic-tests",()=>[]),
  micTargetActive:false,micTargetGoodFrames:0,micPitchCandidateHz:0,micPitchCandidateFrames:0,micAcceptedNoteId:null,micLastAcceptedAt:0,
  audioClockActive:false,bassSyncIndex:0,showBeats:readJSON("bh-show-beats",()=>true),
  tabZoom:100,selectedNoteId:null
};

const storedMusicVolume=Number(localStorage.getItem("bh-music-volume")??".65");
const storedGuideVolume=Number(localStorage.getItem("bh-guide-volume")??".15");
state.musicVolume=Number.isFinite(storedMusicVolume)?Math.max(0,Math.min(1,storedMusicVolume)):.65;
state.guideVolume=Number.isFinite(storedGuideVolume)?Math.max(0,Math.min(1,storedGuideVolume)):.15;
state.savedTabs=Array.isArray(state.savedTabs)?state.savedTabs.filter(song=>song&&typeof song.id==="string"&&Array.isArray(song.notes)&&song.notes.length>0):[];
state.songStats=state.songStats&&typeof state.songStats==="object"&&!Array.isArray(state.songStats)?state.songStats:{};
state.progress=state.progress&&typeof state.progress==="object"&&!Array.isArray(state.progress)?state.progress:{};
state.micTestHistory=Array.isArray(state.micTestHistory)?state.micTestHistory.slice(-20):[];
state.showBeats=state.showBeats!==false;
const safeCount=value=>Number.isFinite(Number(value))&&Number(value)>=0?Math.floor(Number(value)):0;
state.globalStats={
  completed:safeCount(state.globalStats?.completed),
  hits:safeCount(state.globalStats?.hits),
  misses:safeCount(state.globalStats?.misses),
  seconds:Number.isFinite(Number(state.globalStats?.seconds))&&Number(state.globalStats.seconds)>=0?Number(state.globalStats.seconds):0
};
const storedAI=state.aiProfile&&typeof state.aiProfile==="object"?state.aiProfile:{};
const storedAIStrings=storedAI.strings&&typeof storedAI.strings==="object"?storedAI.strings:{};
state.aiProfile={
  tests:safeCount(storedAI.tests),
  lastAccuracy:Number.isFinite(Number(storedAI.lastAccuracy))?Math.max(0,Math.min(100,Number(storedAI.lastAccuracy))):0,
  strings:Object.fromEntries(STRINGS.map(string=>{
    const value=storedAIStrings[string]&&typeof storedAIStrings[string]==="object"?storedAIStrings[string]:{};
    const finite=(item,fallback)=>Number.isFinite(Number(item))?Number(item):fallback;
    return [string,{
      offsetCents:Math.max(-100,Math.min(100,finite(value.offsetCents,0))),
      samples:safeCount(value.samples),
      meanAbsError:Math.max(0,finite(value.meanAbsError,0)),
      errors:safeCount(value.errors)
    }];
  }))
};
function makeSong(id,title,bpm,bars,description){
  const notes=[];
  bars.forEach((bar,barIndex)=>bar.forEach((item)=>{
    const [offset,string,fret,duration,technique,display] = item;
    notes.push({id:id+"-"+notes.length,beat:barIndex*4+offset,string,fret,duration:duration||.5,technique:technique||"",display:display||String(fret),status:"pending",wrongRecorded:false});
  }));
  notes.sort((a,b)=>a.beat-b.beat);
  return {id,title,bpm,bars:bars.length,totalBeats:bars.length*4,notes,description:description||"Originální demo skladba"};
}
const DEMO_SONGS = [
  makeSong("neon-steps","Neon Steps",96,[
    [[0,"E",3,.75], [1,"A",5,.5], [2,"D",2,.5], [3,"A",5,.5]],
    [[0,"E",3,.5], [1,"E",3,.5], [2,"D",2,.5], [3,"A",5,.5]],
    [[0,"E",0,1], [1.5,"A",2,.5], [2.5,"D",2,.5], [3.5,"A",2,.5]],
    [[0,"E",3,.75], [1,"A",5,.5], [2,"D",4,.5,"h","2h4"], [3,"A",5,.5]],
    [[0,"E",3,.75], [1,"A",5,.5], [2,"D",2,.5], [3,"A",5,.5]],
    [[0,"E",3,.5], [1,"E",3,.5], [2,"D",2,.5], [3,"A",5,.5]],
    [[0,"E",0,1], [1.5,"A",2,.5], [2.5,"D",2,.5], [3.5,"A",2,.5]],
    [[0,"E",3,.75], [1,"A",5,.5], [2,"D",4,.5,"/","4/6"], [3,"A",5,.5]],
    [[0,"E",5,.75], [1,"A",7,.5], [2,"D",4,.5], [3,"A",7,.5]],
    [[0,"E",5,.5], [1,"E",5,.5], [2,"D",4,.5], [3,"A",7,.5]],
    [[0,"E",2,1], [1.5,"A",4,.5], [2.5,"D",4,.5], [3.5,"A",4,.5]],
    [[0,"E",5,.75], [1,"A",7,.5], [2,"D",4,.5,"p","6p4"], [3,"A",7,.5]],
    [[0,"E",3,.75], [1,"A",5,.5], [2,"D",2,.5], [3,"A",5,.5]],
    [[0,"E",3,.5], [1,"E",3,.5], [2,"D",2,.5], [3,"A",5,.5]],
    [[0,"E",0,1], [1.5,"A",2,.5], [2.5,"D",2,.5], [3.5,"A",2,.5]],
    [[0,"E",3,2], [2,"A",5,.75], [3,"E",3,.75,"~","3~"]]
  ],"Moderní demo groove · 16 taktů"),
  makeSong("midnight-drive","Midnight Drive",82,[
    [[0,"E",0,1.5], [2,"A",3,.5], [3,"D",2,.5]],
    [[0,"E",0,1], [1.5,"A",3,.5], [2.5,"D",5,.5], [3.5,"A",3,.5]],
    [[0,"E",5,1.5], [2,"A",3,.5], [3,"D",2,.5]],
    [[0,"E",3,1], [1.5,"A",3,.5], [2.5,"D",5,.5], [3.5,"A",3,.5]],
    [[0,"E",0,1.5], [2,"A",3,.5], [3,"D",2,.5]],
    [[0,"E",0,1], [1.5,"A",3,.5], [2.5,"D",5,.5], [3.5,"A",3,.5]],
    [[0,"E",5,1.5], [2,"A",3,.5], [3,"D",2,.5]],
    [[0,"E",3,1], [1.5,"A",3,.5], [2.5,"D",5,.5], [3.5,"A",3,.5]],
    [[0,"E",7,.75], [1,"A",5,.5], [2,"D",4,.5], [3,"A",5,.5]],
    [[0,"E",5,1], [1.5,"A",7,.5], [2.5,"D",5,.5], [3.5,"A",7,.5]],
    [[0,"E",3,1.5], [2,"A",5,.5], [3,"D",4,.5]],
    [[0,"E",5,1], [1.5,"A",7,.5], [2.5,"D",5,.5], [3.5,"A",7,.5]],
    [[0,"E",0,1.5], [2,"A",3,.5], [3,"D",2,.5]],
    [[0,"E",0,1], [1.5,"A",3,.5], [2.5,"D",5,.5], [3.5,"A",3,.5]],
    [[0,"E",5,1.5], [2,"A",3,.5], [3,"D",2,.5]],
    [[0,"E",0,2], [2,"A",3,1], [3,"E",0,.75]]
  ],"Pomalý noční groove · 16 taktů"),
  makeSong("river-line","River Line",110,[
    [[0,"A",2,.5], [.5,"D",4,.5], [1,"G",2,.5], [2,"D",4,.5], [3,"A",2,.5]],
    [[0,"A",2,.5], [1,"D",4,.5], [2,"G",4,.5], [3,"D",2,.5]],
    [[0,"E",5,.5], [1,"A",5,.5], [2,"D",4,.5], [3,"G",2,.5]],
    [[0,"A",2,.5], [1,"D",4,.5], [2,"G",4,.5], [3,"D",2,.5]],
    [[0,"A",2,.5], [.5,"D",4,.5], [1,"G",2,.5], [2,"D",4,.5], [3,"A",2,.5]],
    [[0,"A",2,.5], [1,"D",4,.5], [2,"G",4,.5], [3,"D",2,.5]],
    [[0,"E",5,.5], [1,"A",5,.5], [2,"D",4,.5], [3,"G",2,.5]],
    [[0,"A",2,.5], [1,"D",4,.5], [2,"G",4,.5], [3,"D",2,.5]],
    [[0,"A",7,.5], [.5,"D",9,.5], [1,"G",7,.5], [2,"D",9,.5], [3,"A",7,.5]],
    [[0,"A",7,.5], [1,"D",9,.5], [2,"G",9,.5], [3,"D",7,.5]],
    [[0,"E",5,.5], [1,"A",7,.5], [2,"D",9,.5], [3,"G",7,.5]],
    [[0,"A",7,.5], [1,"D",9,.5], [2,"G",9,.5], [3,"D",7,.5]],
    [[0,"A",2,.5], [.5,"D",4,.5], [1,"G",2,.5], [2,"D",4,.5], [3,"A",2,.5]],
    [[0,"A",2,.5], [1,"D",4,.5], [2,"G",4,.5], [3,"D",2,.5]],
    [[0,"E",5,.5], [1,"A",5,.5], [2,"D",4,.5], [3,"G",2,.5]],
    [[0,"A",2,1], [2,"D",4,1], [3,"A",2,.75,"~","2~"]]
  ],"Rychlejší melodická linka · 16 taktů")
];

const screenHistory=[];
function show(id,fromBack=false){
  const currentScreen=$(".screen.active")?.id;
  if(!document.getElementById(id))return;
  if(currentScreen!==id&&!fromBack){
    if(currentScreen)screenHistory.push(currentScreen);
    try{history.pushState({bassHeroScreen:id},"","#"+id);}catch(_){}
  }else if(fromBack&&screenHistory.length){
    screenHistory.pop();
  }
  if(currentScreen!==id&&(state.micEnabled||state.micStarting||state.micTestActive)){
    state.micTestActive=false;
    stopMic();
  }
  if(currentScreen==="player-screen"&&id!=="player-screen")stopPlayback(false);
  $$(".screen").forEach(el=>el.classList.toggle("active",el.id===id));
  if(id==="stats-screen")renderStats();
  if(id==="editor-screen")renderSavedTabs();
  if(id==="mic-test-screen")renderMicTest();
  if(id==="tabs-screen")renderSongList();
}
window.addEventListener("popstate",event=>{
  const previous=screenHistory.length?screenHistory[screenHistory.length-1]:"home-screen";
  show(event.state?.bassHeroScreen||previous,true);
});
$$("[data-screen]").forEach(btn=>btn.addEventListener("click",()=>show(btn.dataset.screen)));
$("#settings-shortcut").onclick=()=>show("settings-screen");
$("#open-editor").onclick=()=>show("editor-screen");
$("#open-ai-audio").onclick=()=>show("ai-audio-screen");
$("#import-tab-home").onclick=()=>$("#tab-file").click();

function getSongById(id){return DEMO_SONGS.find(s=>s.id===id)||state.savedTabs.find(s=>s.id===id)||null;}
function renderSongList(){
  const list=$("#song-list");if(!list)return;
  const all=DEMO_SONGS.concat(state.savedTabs);
  list.innerHTML="";
  all.forEach((song,index)=>{
    const card=document.createElement("article");card.className="song-card";
    const art=document.createElement("div");art.className="song-art";art.textContent=index%3===0?"♫":index%3===1?"♬":"♩";
    const info=document.createElement("div");info.className="song-info";
    const title=document.createElement("strong");title.textContent=song.title;
    const meta=document.createElement("small");meta.textContent=song.bpm+" BPM · "+song.bars+" taktů · "+song.notes.length+" tónů";
    info.append(title,meta);
    const actions=document.createElement("div");actions.className="song-actions";
    const preview=document.createElement("button");preview.className="outline-button";preview.textContent="UKÁZKA";preview.onclick=()=>previewSong(song);
    const play=document.createElement("button");play.className="primary-button";play.textContent="OTEVŘÍT";play.onclick=()=>openSong(song);
    actions.append(preview,play);card.append(art,info,actions);list.append(card);
  });
  if(!all.length)list.textContent="Zatím nejsou uložené žádné tabulatury.";
}

function openSong(song){
  stopPlayback(false);
  state.song={...song,syncOffsetMs:Number(song.syncOffsetMs)||0,notes:song.notes.map((n,i)=>({...n,id:song.id+"-"+i,offsetMs:Number(n.offsetMs)||0,status:"pending",wrongRecorded:false}))};
  state.selectedNoteId=null;
  state.currentIndex=0;state.hits=0;state.misses=0;state.currentBeat=0;state.startBeat=0;state.waiting=false;state.previewing=false;state.guidePlayed=new Set();state.lastSynthStep=-1;
  const progress=state.progress[song.id];
  state.resumeBeat=progress&&progress.beat>0&&progress.beat<song.totalBeats?progress.beat:0;
  $("#song-title").textContent=song.title;$("#song-subtitle").textContent=song.bpm+" BPM · "+song.bars+" taktů · "+song.description;
  const savedPlayMode=localStorage.getItem("bh-play-mode");
  const savedSoundMode=localStorage.getItem("bh-sound-mode");
  const savedSpeed=localStorage.getItem("bh-speed");
  $("#play-mode").value=["wait","flow"].includes(savedPlayMode)?savedPlayMode:"wait";
  $("#sound-mode").value=["original","bass-sync"].includes(savedSoundMode)?savedSoundMode:"original";
  $("#player-speed").value=[...$("#player-speed").options].some(option=>option.value===savedSpeed)?savedSpeed:"1";
  $("#player-bpm").value=state.song.bpm;
  $("#sync-offset").value=state.song.syncOffsetMs;
  $("#sync-offset-value").textContent=(state.song.syncOffsetMs>0?"+":"")+state.song.syncOffsetMs+" ms";
  $("#tab-zoom").value=state.tabZoom;
  $("#tab-zoom-value").textContent=state.tabZoom+" %";
  $("#show-beats").checked=state.showBeats;
  $("#note-editor-panel").hidden=true;
  $("#player-resume").style.display=state.resumeBeat>0?"inline-block":"none";
  $("#audio-file-label").textContent=state.audioSources[song.id]?"Vlastní audio připojeno":"Demo používá vytvořený doprovod";
  state.speed=Number($("#player-speed").value);state.playMode=$("#play-mode").value;state.soundMode=$("#sound-mode").value;
  updateSoundModeNote();
  if(state.audioSources[song.id])setAudioSource(state.audioSources[song.id],false);
  else{setAudioSource(null,false);restoreAudioAsset(song.id);}
  renderTab();updatePlayerUI(0);show("player-screen");
  $("#player-feedback").textContent="Připraveno. Zapni mikrofon a spusť skladbu.";
}
function previewSong(song){
  openSong(song);
  $("#player-feedback").textContent="Přehrává se krátká ukázka skladby.";
  startPlayer(true,false);
}
function getGlobalOffsetBeat(){return state.song?(Number(state.song.syncOffsetMs)||0)*state.song.bpm/60000:0;}
function getNoteBeat(note){return state.song?(Number(note.beat)||0)+((Number(state.song.syncOffsetMs)||0)+(Number(note.offsetMs)||0))*state.song.bpm/60000:(Number(note.beat)||0);}
function renderTab(){
  const canvas=$("#tab-canvas");if(!canvas||!state.song)return;
  canvas.innerHTML="";
  canvas.classList.toggle("has-beats",state.showBeats);
  const playhead=document.createElement("div");playhead.className="tab-playhead";playhead.id="tab-playhead";canvas.append(playhead);
  const zoom=(state.tabZoom||100)/100;
  for(let bar=0;bar<state.song.bars;bar++){
    const notesInBar=state.song.notes.filter(n=>Math.floor(getNoteBeat(n)/4)===bar);
    let minGap=1;const byString={E:[],A:[],D:[],G:[]};
    notesInBar.forEach(n=>byString[n.string].push(getNoteBeat(n)%4));
    Object.values(byString).forEach(beats=>{beats.sort((x,y)=>x-y);for(let i=1;i<beats.length;i++)minGap=Math.min(minGap,beats[i]-beats[i-1]);});
    const baseWidth=Math.max(154,Math.min(680,24+(26/Math.max(.1,minGap))*4));
    const barWidth=Math.round(baseWidth*zoom);
    const block=document.createElement("div");block.className="tab-bar";block.dataset.bar=String(bar);
    block.style.width=barWidth+"px";block.style.flexBasis=barWidth+"px";
    const label=document.createElement("div");label.className="bar-label";label.textContent="TAKT "+String(bar+1);block.append(label);
    if(state.showBeats){
      block.classList.add("has-beat-ruler");
      const ruler=document.createElement("div");ruler.className="beat-ruler";
      for(let beat=0;beat<4;beat++){
        const mark=document.createElement("span");mark.textContent=String(beat+1);
        mark.style.left=(12+(beat/4)*(barWidth-24))+"px";ruler.append(mark);
      }
      block.append(ruler);
    }
    TOP_STRINGS.forEach(str=>{
      const row=document.createElement("div");row.className="tab-string";row.dataset.string=str;
      const sl=document.createElement("span");sl.className="string-label";sl.textContent=str;row.append(sl);
      notesInBar.filter(n=>n.string===str).forEach(note=>{
        const mark=document.createElement("span");mark.className="tab-note string-"+str;mark.dataset.noteId=note.id;mark.textContent=note.display||String(note.fret);
        const beatInBar=getNoteBeat(note)%4,x=12+(beatInBar/4)*(barWidth-24);
        mark.style.left=x+"px";mark.style.transform="translateX(0)";
        mark.style.width=Math.max(21,Math.min(barWidth-x-2,Math.round((note.duration||.5)*30*zoom)))+"px";
        mark.setAttribute("role","button");mark.tabIndex=0;
        if(note.id===state.selectedNoteId)mark.classList.add("selected-note");
        if(note.technique)mark.title=note.technique;
        mark.addEventListener("click",()=>selectNoteForEditing(note));
        mark.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();selectNoteForEditing(note);}});
        row.append(mark);
      });
      block.append(row);
    });
    canvas.append(block);
  }
}
function findNextNote(){if(!state.song)return null;for(let i=state.currentIndex;i<state.song.notes.length;i++){if(state.song.notes[i].status==="pending")return state.song.notes[i];}return null;}
function updatePlayerUI(beat){
  if(!state.song)return;
  const safeBeat=Math.max(0,Math.min(state.song.totalBeats,beat));
  state.currentBeat=safeBeat;
  const pct=Math.floor(safeBeat/state.song.totalBeats*100);
  $("#song-percent").textContent=pct+" %";$("#song-progress").style.width=pct+"%";
  const bar=Math.min(state.song.bars,Math.floor(safeBeat/4)+1);
  $("#bar-counter").textContent="TAKT "+bar+" / "+state.song.bars;
  $("#hit-counter").textContent=state.hits+" správně";$("#miss-counter").textContent=state.misses+" chyb";
  const current=state.waiting?state.song.notes[state.currentIndex]:findNextNote();
  const nextIndex=current?state.song.notes.indexOf(current)+1:state.song.notes.length;
  const next=state.song.notes[nextIndex]||null;
  $("#current-note").textContent=current?current.string+" · "+current.display:"Dokončeno";
  $("#current-technique").textContent=current&&current.technique?current.technique:"";
  $("#next-note").textContent=next?next.string+" · "+next.display:"Konec";
  $("#muted-note-confirm").style.display=current&&current.muted?"block":"none";
  const playhead=$("#tab-playhead");
  if(playhead){
    const bars=[...$("#tab-canvas").querySelectorAll(".tab-bar")],barIndex=Math.min(Math.max(0,bars.length-1),Math.floor(safeBeat/4));
    let x=8;for(let i=0;i<barIndex;i++)x+=bars[i].offsetWidth||154;
    const currentBar=bars[barIndex],width=currentBar?(currentBar.offsetWidth||154):154;
    x+=Math.max(0,Math.min(1,(safeBeat-barIndex*4)/4))*width;playhead.style.left=x+"px";
    const viewport=$("#tab-viewport");
    if(state.playing||state.waiting){const desired=Math.max(0,x-viewport.clientWidth*.32);if(Math.abs(viewport.scrollLeft-desired)>3)viewport.scrollLeft=desired;}
  }
  state.song.notes.forEach(n=>{
    const mark=document.querySelector('[data-note-id="'+n.id+'"]');
    if(mark)mark.classList.toggle("active-note",current&&current.id===n.id);
  });
}
function setNoteStatus(note,status){
  note.status=status;
  const mark=document.querySelector('[data-note-id="'+note.id+'"]');
  if(mark){mark.classList.remove("active-note");mark.classList.toggle("note-hit",status==="hit");mark.classList.toggle("note-missed",status==="missed");}
}

function selectNoteForEditing(note){
  $("#tab-edit-details").open=true;
  state.selectedNoteId=note.id;$("#note-editor-panel").hidden=false;
  $("#note-edit-title").textContent="Nota · "+note.string+" "+note.display;
  $("#note-edit-string").value=note.string;$("#note-edit-fret").value=note.fret;
  const options=[...$("#note-edit-technique").options],known=options.some(o=>o.value===note.technique);
  $("#note-edit-technique").value=known?note.technique:(note.technique?"__keep__":"");
  $("#note-edit-offset").value=Number(note.offsetMs)||0;renderTab();
}
function saveSelectedNote(){
  if(!state.song||!state.selectedNoteId)return;
  const note=state.song.notes.find(n=>n.id===state.selectedNoteId);if(!note)return;
  note.string=$("#note-edit-string").value;note.fret=Math.max(0,Math.min(24,Math.round(Number($("#note-edit-fret").value)||0)));
  const technique=$("#note-edit-technique").value;
  if(technique!=="__keep__"){
    note.technique=technique;
    note.muted=technique==="muted note";
  }
  note.display=note.muted?"x":String(note.fret);
  note.offsetMs=Math.max(-500,Math.min(500,Number($("#note-edit-offset").value)||0));
  $("#note-edit-title").textContent="Upraveno · "+note.string+" "+note.display;renderTab();
}
function reviewAndRepairTab(){
  if(!state.song)return;const notes=[...state.song.notes].sort((x,y)=>x.beat-y.beat);let corrected=0,flagged=0;
  const midiFor=n=>({E:28,A:33,D:38,G:43}[n.string]+Number(n.fret));
  for(let i=1;i<notes.length-1;i++){
    const n=notes[i],p=notes[i-1],next=notes[i+1],seconds=(Number(n.duration)||.5)*60/state.song.bpm;
    if(seconds<.16&&midiFor(p)===midiFor(next)&&midiFor(n)!==midiFor(p)){
      const pos=bassPositionFromMidi(midiFor(p));
      if(pos){n.string=pos.string;n.fret=pos.fret;n.display=String(pos.fret);n.technique="Opravený krátký výkyv";corrected++;}
    }
  }
  notes.forEach((n,i)=>{const p=notes[i-1];if(n.fret>19||(p&&p.string===n.string&&Math.abs(midiFor(n)-midiFor(p))>=12))flagged++;});
  renderTab();$("#tab-review-status").textContent="Kontrola hotová · opraveno "+corrected+" krátkých výkyvů · "+flagged+" podezřelých míst k ruční kontrole. Nejde o jistý verdikt.";
}
function suggestTechniques(){
  if(!state.song)return;const notes=[...state.song.notes].sort((x,y)=>x.beat-y.beat);let count=0;
  for(let i=0;i<notes.length-1;i++){
    const current=notes[i],next=notes[i+1],seconds=(next.beat-current.beat)*60/state.song.bpm,diff=next.fret-current.fret;
    if(current.string===next.string&&seconds>0&&seconds<=.24&&Math.abs(diff)>=1&&Math.abs(diff)<=5&&!next.technique){
      next.technique=diff>0?"Možný hammer-on / slide":"Možný pull-off / slide";count++;
    }
  }
  renderTab();$("#tab-review-status").textContent="Navrženo "+count+" možných technik. Ze samotných tónů nejde spolehlivě rozeznat slide, hammer-on a pull-off.";
}
function setSongBpm(value){
  if(!state.song)return;const next=Math.max(30,Math.min(240,Math.round(Number(value)||state.song.bpm))),previous=state.song.bpm;
  if(next===previous)return;if(state.playing||state.waiting)stopPlayback(true);
  const ratio=next/previous;state.song.notes.forEach(n=>{n.beat*=ratio;n.duration*=ratio;});
  state.song.totalBeats*=ratio;state.song.bpm=next;state.song.bars=Math.max(1,Math.ceil(state.song.totalBeats/4));
  state.currentBeat*=ratio;state.resumeBeat=(state.resumeBeat||0)*ratio;
  if(state.progress[state.song.id]){state.progress[state.song.id].beat*=ratio;localStorage.setItem("bh-song-progress",JSON.stringify(state.progress));}
  $("#player-bpm").value=next;$("#song-subtitle").textContent=next+" BPM · "+state.song.bars+" taktů · "+state.song.description;
  renderTab();updatePlayerUI(state.currentBeat);
}
$("#save-note-edit").onclick=saveSelectedNote;
$("#close-note-edit").onclick=()=>{$("#note-editor-panel").hidden=true;state.selectedNoteId=null;renderTab();};
$("#review-tab").onclick=reviewAndRepairTab;
$("#suggest-techniques").onclick=suggestTechniques;
$("#save-project").onclick=async()=>{
  if(!state.song)return;const oldId=state.song.id,projectId=oldId.startsWith("custom-")?oldId:"custom-project-"+Date.now();
  const project={...state.song,id:projectId,notes:state.song.notes.map(n=>({...n,status:"pending",wrongRecorded:false}))};
  state.song.id=projectId;saveCustomSong(project);
  const audio=state.audioSources[oldId];
  if(audio){state.audioSources[projectId]=audio;const saved=await saveAudioAsset(projectId,audio);$("#player-feedback").textContent=saved?"Projekt a MP3 byly uloženy v telefonu.":"Projekt uložen, ale MP3 se nepodařilo trvale uložit.";}
  else $("#player-feedback").textContent="Projekt byl uložen do knihovny.";
};
$("#player-bpm").onchange=e=>setSongBpm(e.target.value);
$("#sync-offset").onchange=e=>{
  if(!state.song)return;if(state.playing||state.waiting)stopPlayback(true);
  state.song.syncOffsetMs=Math.max(-500,Math.min(500,Number(e.target.value)||0));e.target.value=state.song.syncOffsetMs;
  $("#sync-offset-value").textContent=(state.song.syncOffsetMs>0?"+":"")+state.song.syncOffsetMs+" ms";
  renderTab();updatePlayerUI(state.currentBeat);
};
$("#tab-zoom").oninput=e=>{
  state.tabZoom=Math.max(35,Math.min(160,Number(e.target.value)||100));$("#tab-zoom-value").textContent=state.tabZoom+" %";
  renderTab();updatePlayerUI(state.currentBeat);
};
$("#show-beats").onchange=e=>{
  state.showBeats=Boolean(e.target.checked);localStorage.setItem("bh-show-beats",JSON.stringify(state.showBeats));
  renderTab();updatePlayerUI(state.currentBeat);
};
$("#tab-fit").onclick=()=>{
  const bars=[...$("#tab-canvas").querySelectorAll(".tab-bar")],total=bars.reduce((s,b)=>s+(b.offsetWidth||154),0);
  const available=Math.max(180,$("#tab-viewport").clientWidth-20);
  state.tabZoom=Math.max(35,Math.min(100,Math.floor(available/Math.max(1,total)*100)));
  $("#tab-zoom").value=state.tabZoom;$("#tab-zoom-value").textContent=state.tabZoom+" %";renderTab();updatePlayerUI(state.currentBeat);
};

function ensureAudioContext(){
  if(!state.audioContext){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error("Web Audio není na tomto zařízení dostupné.");state.audioContext=new C();}
  if(state.audioContext.state==="suspended")state.audioContext.resume();
  return state.audioContext;
}
function synthTone(freq,duration,volume,wave){
  if(!volume||volume<=0)return;
  let ctx;try{ctx=ensureAudioContext();}catch(_){return;}
  const osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;
  osc.type=wave||"sine";osc.frequency.setValueAtTime(Math.max(20,Math.min(8000,freq)),now);
  gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+Math.max(.04,duration));
  osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+Math.max(.05,duration)+.03);
}
function noteFrequency(string,fret){return OPEN_HZ[string]*Math.pow(2,Number(fret)/12);}
function playGuideNote(note){
  if(!note||state.guideVolume<=0)return;
  synthTone(noteFrequency(note.string,note.fret),.24,state.guideVolume*.22,"triangle");
}
function playBassSyncNote(note){
  if(!note||state.guideVolume<=0)return;
  const duration=Math.max(.08,Math.min(2.5,(Number(note.duration)||.5)*60/state.song.bpm/state.speed*.88));
  synthTone(noteFrequency(note.string,note.fret),duration,state.guideVolume*.48,"triangle");
}
function runBassSyncNotes(beat){
  if(!state.song)return;
  while(state.bassSyncIndex<state.song.notes.length){
    const note=state.song.notes[state.bassSyncIndex];
    const noteBeat=getNoteBeat(note);
    if(noteBeat>beat+.02)break;
    if(state.soundMode==="bass-sync"&&noteBeat>=state.startBeat-.05)playBassSyncNote(note);
    state.bassSyncIndex++;
  }
}
function playBackingStep(step){
  const beat=step/2,bar=Math.floor(beat/4),inBar=beat%4,sub=step%2;
  if(state.audioElement&&state.audioElement.src){
    if(state.soundMode==="original")return;
    if(sub===0){
      if(inBar===0||inBar===2)synthTone(inBar===0?68:92,.12,.19*state.musicVolume,"sine");
      else synthTone(210,.08,.07*state.musicVolume,"triangle");
    }
    synthTone(sub===0?7200:5200,.025,(sub===0?.032:.012)*state.musicVolume,"sine");
    return;
  }
  if(state.soundMode==="original"){
    if(sub===0){
      if(inBar===0){const roots=[110,98,82.4,98][bar%4];synthTone(roots,.9,.075*state.musicVolume,"triangle");synthTone(roots*1.25,.7,.035*state.musicVolume,"sine");}
      if(inBar===0||inBar===2)synthTone(55,.11,.14*state.musicVolume,"sine");
      if(inBar===1||inBar===3)synthTone(185,.07,.045*state.musicVolume,"triangle");
    }
    synthTone(sub===0?6200:4800,.025,(sub===0?.018:.009)*state.musicVolume,"sine");
  }else{
    if(sub===0){
      if(inBar===0||inBar===2)synthTone(inBar===0?68:92,.12,.19*state.musicVolume,"sine");
      else synthTone(210,.08,.07*state.musicVolume,"triangle");
      if(inBar===0){const root=[110,98,82.4,98][bar%4];synthTone(root,.35,.052*state.musicVolume,"triangle");}
    }
    synthTone(sub===0?7200:5200,.025,(sub===0?.032:.012)*state.musicVolume,"sine");
  }
}
function runAudioStep(beat){
  const step=Math.floor(beat*2+0.0001);
  if(step<=state.lastSynthStep)return;
  for(let s=state.lastSynthStep+1;s<=step;s++)playBackingStep(s);
  state.lastSynthStep=step;
}
function updateSoundModeNote(){
  const note=$("#sound-mode-note");if(!note)return;
  if(state.soundMode==="bass-sync"){
    note.textContent="Bass Sync přehraje původní audio a basovou linku vytvořenou z tabu ve stejném časování. Záznam se neodděluje na samostatné stopy, takže nepřesné tóny může být potřeba upravit.";
  }else{
    note.textContent="Original přehraje pouze připojenou nahrávku. Bez vlastního audia použije Bass Hero vytvořený doprovod.";
  }
}
function setAudioSource(file,announce){
  if(state.audioElement){state.audioElement.pause();state.audioElement=null;}
  if(state.audioUrl){URL.revokeObjectURL(state.audioUrl);state.audioUrl=null;}
  if(!file){if(state.song)state.audioSources[state.song.id]=null;if(announce)$("#audio-file-label").textContent="Demo používá vytvořený doprovod";return;}
  state.audioUrl=URL.createObjectURL(file);state.audioElement=new Audio(state.audioUrl);
  state.audioElement.preload="auto";state.audioElement.volume=state.musicVolume;state.audioElement.playbackRate=state.speed;
  if(state.song)state.audioSources[state.song.id]=file;
  $("#audio-file-label").textContent=file.name;
  if(announce)$("#player-feedback").textContent="Vlastní audio připojeno. V Original hraje nahrávka, Bass Sync přidá rytmické zvýraznění.";
}

function openAudioDatabase(){
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){reject(new Error("Toto zařízení nepodporuje místní ukládání audia."));return;}
    const request=indexedDB.open("bass-hero-audio",1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains("tracks"))db.createObjectStore("tracks");
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Databázi audia se nepodařilo otevřít."));
  });
}
async function saveAudioAsset(id,file){
  let db;
  try{
    db=await openAudioDatabase();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction("tracks","readwrite");
      tx.objectStore("tracks").put({blob:file,name:file.name||"track.mp3",type:file.type||"audio/mpeg"},id);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error("Uložení MP3 selhalo."));
      tx.onabort=()=>reject(tx.error||new Error("Uložení MP3 bylo přerušeno."));
    });
    db.close();
    return true;
  }catch(error){
    if(db)db.close();
    return false;
  }
}
async function loadAudioAsset(id){
  let db;
  try{
    db=await openAudioDatabase();
    const record=await new Promise((resolve,reject)=>{
      const tx=db.transaction("tracks","readonly");
      const request=tx.objectStore("tracks").get(id);
      request.onsuccess=()=>resolve(request.result||null);
      request.onerror=()=>reject(request.error||new Error("Načtení MP3 selhalo."));
    });
    db.close();
    if(!record||!record.blob)return null;
    return new File([record.blob],record.name||"track.mp3",{type:record.type||"audio/mpeg"});
  }catch(error){
    if(db)db.close();
    return null;
  }
}
async function restoreAudioAsset(songId){
  const file=await loadAudioAsset(songId);
  if(!file||!state.song||state.song.id!==songId)return;
  state.audioSources[songId]=file;
  setAudioSource(file,false);
  $("#audio-file-label").textContent=file.name||"Uložené MP3";
  $("#player-feedback").textContent="Uložené MP3 bylo načteno z tohoto telefonu.";
}
function bassPositionFromMidi(midi){
  const open={E:28,A:33,D:38,G:43};
  const choices=[];
  STRINGS.forEach(string=>{
    const fret=midi-open[string];
    if(fret>=0&&fret<=24)choices.push({string,fret});
  });
  choices.sort((a,b)=>a.fret-b.fret||STRINGS.indexOf(a.string)-STRINGS.indexOf(b.string));
  return choices[0]||null;
}
function detectBpmFromBuffer(audioBuffer){
  const rate=audioBuffer.sampleRate,hop=Math.max(1,Math.round(rate*.01)),frames=Math.floor(audioBuffer.length/hop);
  if(frames<400)return {bpm:0,confidence:0};
  const channels=[];
  for(let c=0;c<audioBuffer.numberOfChannels;c++)channels.push(audioBuffer.getChannelData(c));
  const energy=new Float32Array(frames);let previous=0;
  for(let f=0;f<frames;f++){
    const start=f*hop,end=Math.min(audioBuffer.length,start+hop);let sum=0,count=0;
    for(let i=start;i<end;i+=2){let sample=0;for(let c=0;c<channels.length;c++)sample+=channels[c][i]||0;sample/=channels.length;sum+=sample*sample;count++;}
    const rms=count?Math.sqrt(sum/count):0;energy[f]=Math.max(0,rms-previous);previous=rms;
  }
  let mean=0;for(let i=0;i<frames;i++)mean+=energy[i];mean/=frames;
  let variance=0;for(let i=0;i<frames;i++){energy[i]-=mean*.65;variance+=energy[i]*energy[i];}
  if(variance<1e-8)return {bpm:0,confidence:0};
  const minLag=Math.max(2,Math.floor(60/(190*.01))),maxLag=Math.min(frames-2,Math.ceil(60/(55*.01)));
  let bestLag=0,bestScore=-1;
  for(let lag=minLag;lag<=maxLag;lag++){
    let cross=0,left=0,right=0;
    for(let i=lag;i<frames;i++){const x=energy[i],y=energy[i-lag];cross+=x*y;left+=x*x;right+=y*y;}
    const score=cross/Math.sqrt(Math.max(1e-12,left*right));
    if(score>bestScore){bestScore=score;bestLag=lag;}
  }
  const raw=bestLag?Math.round(60/(bestLag*.01)):0,confidence=Math.max(0,Math.min(1,bestScore));
  return {bpm:confidence>=.08?Math.max(55,Math.min(190,raw)):0,confidence};
}
async function analyzeBassAudio(file,manualBpm,forceManualBpm,onProgress){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx)throw new Error("Tento telefon nepodporuje analýzu zvuku v prohlížeči.");
  const context=new AudioCtx();
  let audioBuffer;
  try{
    const data=await file.arrayBuffer();
    audioBuffer=await context.decodeAudioData(data.slice(0));
  }catch(error){
    throw new Error("MP3 se nepodařilo dekódovat. Zkus jiný zvukový soubor.");
  }finally{
    if(context.state!=="closed")context.close().catch(()=>{});
  }
  if(audioBuffer.duration>360)throw new Error("První verze zvládá nahrávky do 6 minut.");
  const tempo=detectBpmFromBuffer(audioBuffer);
  const bpm=forceManualBpm?manualBpm:(tempo.bpm||manualBpm);
  const originalRate=audioBuffer.sampleRate;
  const factor=Math.max(1,Math.round(originalRate/4000));
  const sampleRate=originalRate/factor;
  const channelData=[];
  for(let channel=0;channel<audioBuffer.numberOfChannels;channel++)channelData.push(audioBuffer.getChannelData(channel));
  const sampleCount=Math.ceil(audioBuffer.length/factor);
  const mono=new Float32Array(sampleCount);
  const alpha=1-Math.exp(-2*Math.PI*380/originalRate);
  let filtered=0;
  for(let out=0,source=0;out<sampleCount;out++,source+=factor){
    let sample=0;
    for(let channel=0;channel<channelData.length;channel++)sample+=channelData[channel][source]||0;
    sample/=channelData.length;
    filtered+=alpha*(sample-filtered);
    mono[out]=filtered;
  }
  const frameSize=1024,hop=384;
  const minLag=Math.max(2,Math.floor(sampleRate/420));
  const maxLag=Math.min(frameSize-8,Math.floor(sampleRate/38));
  const usable=frameSize-maxLag;
  const frames=[];
  const totalFrames=Math.max(1,Math.floor((mono.length-frameSize)/hop)+1);
  const diff=new Float64Array(maxLag+1);
  for(let frame=0,pos=0;pos+frameSize<=mono.length;frame++,pos+=hop){
    let mean=0;
    for(let i=0;i<frameSize;i+=2)mean+=mono[pos+i];
    mean/=frameSize/2;
    let energy=0;
    for(let i=0;i<frameSize;i+=2){
      const value=mono[pos+i]-mean;
      energy+=value*value;
    }
    if(Math.sqrt(energy/(frameSize/2))<0.0022){
      frames.push(null);
    }else{
      let bestLag=0,bestScore=1;
      for(let lag=minLag;lag<=maxLag;lag++){
        let difference=0;
        for(let i=0;i<usable;i+=2){
          const a=mono[pos+i]-mean;
          const b=mono[pos+i+lag]-mean;
          const delta=a-b;
          difference+=delta*delta;
        }
        diff[lag]=difference;
        const score=difference/Math.max(1e-9,2*energy);
        if(score<bestScore){bestScore=score;bestLag=lag;}
      }
      if(bestLag&&bestScore<0.38){
        const left=diff[Math.max(minLag,bestLag-1)];
        const center=diff[bestLag];
        const right=diff[Math.min(maxLag,bestLag+1)];
        const denominator=left-2*center+right;
        const shift=Math.abs(denominator)>1e-9?Math.max(-0.5,Math.min(0.5,0.5*(left-right)/denominator)):0;
        const frequency=sampleRate/(bestLag+shift);
        if(frequency>=38&&frequency<=420){
          frames.push(Math.round(69+12*Math.log2(frequency/440)));
        }else frames.push(null);
      }else frames.push(null);
    }
    if(frame%35===0){
      if(onProgress)onProgress(Math.round(frame/totalFrames*85),"Rozpoznávám tóny…");
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  for(let i=1;i<frames.length-1;i++){
    if(frames[i-1]!==null&&frames[i-1]===frames[i+1]&&frames[i]!==frames[i-1])frames[i]=frames[i-1];
    else if(frames[i]===null&&frames[i-1]!==null&&frames[i-1]===frames[i+1])frames[i]=frames[i-1];
  }
  const notes=[];
  let start=0;
  while(start<frames.length){
    const midi=frames[start];
    let end=start;
    while(end+1<frames.length&&frames[end+1]===midi)end++;
    if(midi!==null){
      const durationSeconds=(end-start+1)*hop/sampleRate;
      const position=bassPositionFromMidi(midi);
      if(position&&durationSeconds>=0.06){
        const startSeconds=start*hop/sampleRate;
        notes.push({
          id:"ai-"+notes.length,
          beat:startSeconds*bpm/60,
          string:position.string,
          fret:position.fret,
          duration:Math.max(0.125,durationSeconds*bpm/60),
          technique:"AI odhad",
          display:String(position.fret),
          status:"pending",
          wrongRecorded:false
        });
      }
    }
    start=end+1;
  }
  if(onProgress)onProgress(100,"Dokončeno.");
  if(!notes.length)throw new Error("Nepodařilo se rozpoznat použitelnou basovou linku. Zkus nahrávku, ve které je basa výraznější.");
  const totalBeats=Math.max(4,audioBuffer.duration*bpm/60);
  return {notes,totalBeats,bars:Math.ceil(totalBeats/4),duration:audioBuffer.duration,bpm,bpmConfidence:tempo.confidence};
}
$("#ai-audio-choose").onclick=()=>$("#ai-audio-file").click();
$("#ai-audio-file").onchange=e=>{
  const file=e.target.files&&e.target.files[0];
  $("#ai-audio-file-name").textContent=file?file.name+" · "+Math.round(file.size/1024/1024*10)/10+" MB":"Žádný soubor nevybrán";
  $("#ai-audio-analyze").disabled=!file;
  if(file)$("#ai-audio-status").textContent="Soubor připravený k analýze.";
};
$("#ai-audio-analyze").onclick=async()=>{
  const file=$("#ai-audio-file").files&&$("#ai-audio-file").files[0];
  if(!file){$("#ai-audio-status").textContent="Nejdřív vyber MP3 nebo jiný zvukový soubor.";return;}
  const title=$("#ai-audio-title").value.trim()||file.name.replace(/\.[^.]+$/,"").slice(0,60)||"Moje skladba";
  const manualBpm=Math.max(30,Math.min(240,Number($("#ai-audio-bpm").value)||90));
  const forceManualBpm=$("#ai-audio-use-manual-bpm").checked;
  const button=$("#ai-audio-analyze");
  button.disabled=true;button.textContent="ANALYZUJI…";
  $("#ai-audio-status").textContent="Načítám a analyzuji nahrávku…";
  $("#ai-audio-progress").style.width="2%";
  try{
    const result=await analyzeBassAudio(file,manualBpm,forceManualBpm,(percent,message)=>{
      $("#ai-audio-progress").style.width=Math.max(2,percent)+"%";
      $("#ai-audio-status").textContent=message+" "+percent+" %";
    });
    const song={
      id:"custom-ai-"+Date.now(),
      title,
      bpm:result.bpm,
      bars:result.bars,
      totalBeats:result.totalBeats,
      syncOffsetMs:0,
      notes:result.notes,
      description:"Automatický odhad basové linky · připojené MP3"
    };
    $("#ai-audio-bpm-result").textContent="Odhad BPM: "+result.bpm+" · jistota detekce "+Math.round(result.bpmConfidence*100)+" %"+(forceManualBpm?" · použito ručně zadané tempo":"");
    saveCustomSong(song);
    state.audioSources[song.id]=file;
    const audioSaved=await saveAudioAsset(song.id,file);
    openSong(song);
    state.playMode="flow";
    $("#play-mode").value="flow";
    $("#player-feedback").textContent="Hotovo: "+song.notes.length+" odhadnutých tónů. Zvol Flow pro nepřerušené přehrávání. Výsledek může obsahovat chyby.";
    if(!audioSaved)$("#player-feedback").textContent+=" MP3 zůstane připojené jen do zavření aplikace.";
    $("#player-state").textContent="AI TAB HOTOV";
  }catch(error){
    $("#ai-audio-status").textContent=error.message||"Analýza se nepodařila.";
    $("#ai-audio-progress").style.width="0%";
  }finally{
    button.disabled=false;button.textContent="VYTVOŘIT TABULATURU";
  }
};

$("#load-audio").onclick=()=>$("#audio-file").click();
$("#audio-file").onchange=e=>{const file=e.target.files&&e.target.files[0];if(file)setAudioSource(file,true);};
$("#play-mode").onchange=e=>{state.playMode=e.target.value;localStorage.setItem("bh-play-mode",state.playMode);};
$("#sound-mode").onchange=e=>{state.soundMode=e.target.value;localStorage.setItem("bh-sound-mode",state.soundMode);updateSoundModeNote();};
$("#player-speed").onchange=e=>{
  const oldSpeed=state.speed;const now=performance.now();
  if(state.playing&&state.song){const beat=state.startBeat+(now-state.startAt)/(60000/state.song.bpm/oldSpeed);state.startBeat=beat;state.startAt=now;}
  state.speed=Number(e.target.value);localStorage.setItem("bh-speed",String(state.speed));
  if(state.audioElement)state.audioElement.playbackRate=state.speed;
};

function stopAudioAtCurrentBeat(){
  if(state.audioElement){state.audioElement.pause();state.audioClockActive=false;return;}
}
function startAudioAtBeat(beat){
  if(state.audioElement){
    const audio=state.audioElement;
    const targetTime=Math.max(0,beat*60/state.song.bpm);
    audio.currentTime=Number.isFinite(audio.duration)?Math.min(targetTime,Math.max(0,audio.duration-.02)):targetTime;
    audio.volume=state.musicVolume;audio.playbackRate=state.speed;
    state.audioClockActive=false;
    const playPromise=audio.play();
    if(playPromise&&typeof playPromise.then==="function"){
      playPromise.then(()=>{
        if(state.audioElement===audio&&!audio.paused)state.audioClockActive=true;
      }).catch(()=>{
        if(state.audioElement===audio)$("#player-feedback").textContent="Vlastní audio se nepodařilo spustit. Zkontroluj formát souboru a hlasitost.";
      });
    }else state.audioClockActive=true;
  }
  state.lastSynthStep=Math.floor((beat+getGlobalOffsetBeat())*2)-1;
}

function stopPlayback(save){
  if(state.previewing){state.playMode=state.previewPreviousMode;$("#play-mode").value=state.playMode;}
  if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;
  if(state.countdownTimer)clearTimeout(state.countdownTimer);state.countdownTimer=0;
  if(state.previewTimer)clearTimeout(state.previewTimer);state.previewTimer=0;
  state.playing=false;state.waiting=false;state.previewing=false;
  if(state.audioElement)state.audioElement.pause();state.audioClockActive=false;
  if(save!==false)saveSongProgress();
  $("#player-state").textContent="PAUZA";
}
function saveSongProgress(){
  if(!state.song)return;
  if(state.currentBeat>0&&state.currentBeat<state.song.totalBeats){
    state.progress[state.song.id]={beat:state.currentBeat,savedAt:new Date().toISOString()};
    localStorage.setItem("bh-song-progress",JSON.stringify(state.progress));
    state.resumeBeat=state.currentBeat;$("#player-resume").style.display="inline-block";
  }else if(state.currentBeat>=state.song.totalBeats){
    delete state.progress[state.song.id];localStorage.setItem("bh-song-progress",JSON.stringify(state.progress));state.resumeBeat=0;
  }
}
function startPlayer(isPreview,resume){
  if(!state.song)return;
  stopPlayback(false);
  show("player-screen");
  if(isPreview){
    state.previewPreviousMode=state.playMode;
    state.playMode="flow";
    $("#play-mode").value="flow";
  }
  state.previewing=Boolean(isPreview);state.waiting=false;
  state.currentIndex=0;state.song.notes.forEach(n=>{n.status="pending";n.wrongRecorded=false;});
  state.hits=0;state.misses=0;state.guidePlayed=new Set();
  let fromBeat=resume?state.resumeBeat||0:0;
  state.currentIndex=state.song.notes.findIndex(n=>getNoteBeat(n)>=fromBeat);
  if(state.currentIndex<0)state.currentIndex=state.song.notes.length;
  state.bassSyncIndex=state.currentIndex;state.micAcceptedNoteId=null;state.micLastAcceptedAt=0;
  state.currentBeat=fromBeat;state.startBeat=fromBeat;
  renderTab();updatePlayerUI(fromBeat);
  const begin=()=>{
    state.playing=true;state.startAt=performance.now();state.sessionStartedAt=state.startAt;state.lastSynthStep=Math.floor(fromBeat*2)-1;state.audioClockActive=false;
    $("#player-state").textContent=state.previewing?"UKÁZKA":"PŘEHRÁVÁNÍ";
    $("#player-feedback").textContent=state.previewing?"Krátká ukázka běží…":state.playMode==="wait"?"Čekám na první tón.":"Hraj podle běžící tabulatury.";
    startAudioAtBeat(fromBeat-getGlobalOffsetBeat());
    if(state.previewing){state.previewStartedAt=performance.now();state.previewTimer=setTimeout(()=>{stopPlayback(false);state.playMode=state.previewPreviousMode;$("#play-mode").value=state.playMode;$("#player-feedback").textContent="Ukázka dokončena. Teď můžeš spustit celou skladbu.";$("#player-state").textContent="UKÁZKA HOTOVÁ";},8000);}
    state.raf=requestAnimationFrame(playerTick);
  };
  if(!isPreview&&!resume&&state.countdown>0){
    let left=state.countdown;$("#player-state").textContent="ODPOČET";$("#player-feedback").textContent="Začínáme za "+left+"…";
    const count=()=>{left--;if(left>0){$("#player-feedback").textContent="Začínáme za "+left+"…";state.countdownTimer=setTimeout(count,1000);}else begin();};
    state.countdownTimer=setTimeout(count,1000);
  }else begin();
}
function getLiveBeat(now){
  if(state.audioElement&&state.audioClockActive&&!state.audioElement.paused&&Number.isFinite(state.audioElement.currentTime)){
    return state.audioElement.currentTime*state.song.bpm/60+getGlobalOffsetBeat();
  }
  return state.startBeat+(now-state.startAt)/(60000/state.song.bpm/state.speed);
}
function playerTick(now){
  if(!state.playing||!state.song)return;
  const beat=getLiveBeat(now);
  runAudioStep(beat);runBassSyncNotes(beat);
  if(state.playMode==="wait"){
    const note=findNextNote();
    if(note&&beat>=getNoteBeat(note)){
      state.waiting=true;state.playing=false;state.currentIndex=state.song.notes.indexOf(note);state.currentBeat=getNoteBeat(note);
      stopAudioAtCurrentBeat();$("#player-state").textContent="ČEKÁM NA TÓN";
      $("#player-feedback").textContent="Zahraj "+note.string+" · pražec "+note.display+". Při chybě se tón zopakuje.";
      updatePlayerUI(getNoteBeat(note));playGuideNote(note);return;
    }
  }else{
    const pending=findNextNote();
    if(pending&&beat>getNoteBeat(pending)+.62){
      setNoteStatus(pending,"missed");state.misses++;state.currentIndex=state.song.notes.indexOf(pending)+1;
      $("#player-feedback").textContent="Tón přeskočen · "+pending.string+" "+pending.display;
      updatePlayerUI(beat);
    }
  }
  updatePlayerUI(beat);
  if(state.previewing&&(now-state.previewStartedAt>=8000||beat>=state.song.totalBeats)){
    stopPlayback(false);$("#player-feedback").textContent="Ukázka dokončena. Teď můžeš spustit celou skladbu.";$("#player-state").textContent="UKÁZKA HOTOVÁ";return;
  }
  if(beat>=state.song.totalBeats){finishSong();return;}
  state.raf=requestAnimationFrame(playerTick);
}
function confirmMutedNote(){
  if(!state.song)return;
  if(state.waiting){
    const note=state.song.notes[state.currentIndex];if(note&&note.muted)hitWaitingNote(0);
    return;
  }
  if(state.playing&&state.playMode==="flow"){
    const note=findNextNote();if(!note||!note.muted)return;
    const beat=getLiveBeat(performance.now());
    if(beat>=getNoteBeat(note)-.45&&beat<=getNoteBeat(note)+.62){
      setNoteStatus(note,"hit");state.hits++;state.currentIndex=state.song.notes.indexOf(note)+1;
      $("#player-feedback").textContent="Tlumený tón potvrzen · "+note.string;updatePlayerUI(beat);
    }
  }
}
$("#muted-note-confirm").onclick=confirmMutedNote;
function hitWaitingNote(cents){
  const note=state.song&&state.song.notes[state.currentIndex];if(!note)return;
  setNoteStatus(note,"hit");state.hits++;if(!note.muted)recordAI(note.string,cents,true);
  $("#player-feedback").textContent="Správně! "+note.string+" · "+note.display;
  state.currentIndex++;
  if(state.currentIndex>=state.song.notes.length){finishSong();return;}
  state.waiting=false;state.playing=true;state.startBeat=getNoteBeat(note);state.startAt=performance.now();
  state.micAcceptedNoteId=note.id;
  startAudioAtBeat(getNoteBeat(note)-getGlobalOffsetBeat());$("#player-state").textContent="PŘEHRÁVÁNÍ";
  state.raf=requestAnimationFrame(playerTick);
  updatePlayerUI(getNoteBeat(note));
}
function handleSongPitch(hz){
  if(state.previewing||!state.song||(!state.playing&&!state.waiting))return;
  const note=state.waiting?state.song.notes[state.currentIndex]:findNextNote();
  if(!note||note.muted||state.micAcceptedNoteId===note.id)return;
  const noteBeat=getNoteBeat(note);
  const target=noteFrequency(note.string,note.fret)*Math.pow(2,(state.aiProfile.strings[note.string]?.offsetCents||0)/1200);
  const cents=1200*Math.log2(hz/target);
  const tolerance=state.waiting?90:78;
  const now=performance.now();
  if(Math.abs(cents)<=tolerance){
    if(now-state.micLastAcceptedAt<130)return;
    const currentBeat=getLiveBeat(now);
    if(state.waiting){
      state.micAcceptedNoteId=note.id;state.micLastAcceptedAt=now;hitWaitingNote(cents);return;
    }
    if(currentBeat>=noteBeat-.45&&currentBeat<=noteBeat+.62){
      state.micAcceptedNoteId=note.id;state.micLastAcceptedAt=now;
      setNoteStatus(note,"hit");state.hits++;recordAI(note.string,cents,true);state.currentIndex=state.song.notes.indexOf(note)+1;
      $("#player-feedback").textContent="Správně · "+note.string+" "+note.display;updatePlayerUI(currentBeat);
    }
  }else if(state.waiting){
    if(now-state.lastDetectedAt>850){
      state.lastDetectedAt=now;state.misses++;recordAI(note.string,cents,false);
      $("#player-feedback").textContent="Mimo tón · zkus znovu "+note.string+" "+note.display;
    }
  }else if(!note.wrongRecorded&&Math.abs(cents)>tolerance){
    const currentBeat=getLiveBeat(now);
    if(currentBeat>=noteBeat-.25&&currentBeat<=noteBeat+.55){
      note.wrongRecorded=true;state.misses++;recordAI(note.string,cents,false);
      $("#player-feedback").textContent="Nesprávný tón · další pokus";
    }
  }
}

$("#player-play").onclick=()=>{if(state.waiting){$("#player-feedback").textContent="Zahraj zobrazený tón, přehrávání čeká.";return;}startPlayer(false,false);};
$("#player-pause").onclick=()=>{stopPlayback(true);$("#player-feedback").textContent="Pozice skladby byla uložena.";};
$("#player-restart").onclick=()=>{stopPlayback(false);state.resumeBeat=0;state.currentBeat=0;startPlayer(false,false);};
$("#player-preview").onclick=()=>{stopPlayback(false);startPlayer(true,false);};
$("#player-resume").onclick=()=>{stopPlayback(false);startPlayer(false,true);};
$("#player-back").onclick=()=>{stopPlayback(true);stopMic();show("tabs-screen");};
$("#result-again").onclick=()=>{state.resumeBeat=0;startPlayer(false,false);};
window.addEventListener("pagehide",()=>{if(state.song)saveSongProgress();stopMic();});

function finishSong(){
  if(!state.song)return;
  const elapsed=state.sessionStartedAt?Math.max(0,(performance.now()-state.sessionStartedAt)/1000):0;
  stopPlayback(false);stopMic();state.currentBeat=state.song.totalBeats;
  const total=state.hits+state.misses;const accuracy=total?Math.round(state.hits/total*100):0;
  const previous=state.songStats[state.song.id]||{plays:0,bestAccuracy:0,lastAccuracy:0,totalHits:0,totalMisses:0};
  previous.plays++;previous.lastAccuracy=accuracy;previous.bestAccuracy=Math.max(previous.bestAccuracy,accuracy);previous.totalHits+=state.hits;previous.totalMisses+=state.misses;previous.lastPlayed=new Date().toISOString();
  state.songStats[state.song.id]=previous;localStorage.setItem("bh-song-stats",JSON.stringify(state.songStats));
  state.globalStats.completed++;state.globalStats.hits+=state.hits;state.globalStats.misses+=state.misses;state.globalStats.seconds+=elapsed;
  localStorage.setItem("bh-global-stats",JSON.stringify(state.globalStats));delete state.progress[state.song.id];localStorage.setItem("bh-song-progress",JSON.stringify(state.progress));
  $("#result-song-title").textContent=state.song.title+" · "+state.song.bpm+" BPM";
  $("#result-accuracy").textContent=accuracy+" %";$("#result-hits").textContent=state.hits;$("#result-misses").textContent=state.misses;$("#result-speed").textContent=Math.round(state.speed*100)+" %";$("#result-bars").textContent=state.song.bars;
  const weakest=Object.entries(state.aiProfile.strings).sort((a,b)=>(b[1].errors||0)-(a[1].errors||0))[0];
  $("#result-ai").textContent=state.misses===0?"AI trenér: skvěle, v této skladbě nebyla zaznamenána žádná chyba.": "AI trenér: procvič si hlavně strunu "+weakest[0]+". Při hraní se ukládá přesnost po jednotlivých strunách.";
  state.currentBeat=state.song.totalBeats;updatePlayerUI(state.currentBeat);show("results-screen");
}
function recordAI(string,cents,ok){
  const p=state.aiProfile.strings[string]||(state.aiProfile.strings[string]={offsetCents:0,samples:0,meanAbsError:0,errors:0});
  if(ok){const n=Math.min(p.samples,9);p.offsetCents=(p.offsetCents*n+cents)/(n+1);p.meanAbsError=(p.meanAbsError*n+Math.abs(cents))/(n+1);p.samples++;}
  else p.errors=(p.errors||0)+1;
  localStorage.setItem("bh-ai-profile",JSON.stringify(state.aiProfile));
}

function stopMic(preserveTargetStatus){
  state.micRequestId++;
  state.micStarting=false;
  state.micEnabled=false;state.micTargetActive=false;state.micTargetGoodFrames=0;
  state.micPitchCandidateHz=0;state.micPitchCandidateFrames=0;
  if(state.micFrame)cancelAnimationFrame(state.micFrame);
  if(state.micStream)state.micStream.getTracks().forEach(track=>track.stop());
  if(state.micContext&&state.micContext.state!=="closed")state.micContext.close().catch(()=>{});
  state.micStream=null;state.micContext=null;state.micFrame=0;
  const micToggle=$("#mic-toggle");if(micToggle){micToggle.disabled=false;micToggle.textContent="ZAPNOUT MIKROFON";}
  const testStart=$("#mic-test-start");if(testStart)testStart.disabled=false;
  const targetButton=$("#mic-target-listen");if(targetButton)targetButton.textContent="POSLOUCHAT NA TÓN";
  const targetStatus=$("#mic-target-status");if(targetStatus&&!preserveTargetStatus)targetStatus.textContent="Mikrofon vypnutý";
  const micStatus=$("#mic-status");if(micStatus)micStatus.textContent="Mikrofon vypnutý";
}
async function startMic(){
  if(state.micEnabled||state.micStarting)return;
  const requestId=++state.micRequestId;
  const requestedScreen=$(".screen.active")?.id||"";
  state.micStarting=true;
  const micToggle=$("#mic-toggle");if(micToggle){micToggle.disabled=true;micToggle.textContent="ŽÁDÁM OPRÁVNĚNÍ…";}
  const testStart=$("#mic-test-start");if(requestedScreen==="mic-test-screen"&&testStart)testStart.disabled=true;
  try{
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      const error=new Error("Mikrofon není dostupný. Zkontroluj oprávnění aplikace.");
      error.name="NotSupportedError";throw error;
    }
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    if(requestId!==state.micRequestId||$(".screen.active")?.id!==requestedScreen){
      stream.getTracks().forEach(track=>track.stop());
      return;
    }
    state.micStream=stream;
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)throw new Error("Toto zařízení nepodporuje Web Audio.");
    state.micContext=new AudioContextClass();
    await state.micContext.resume();
    if(requestId!==state.micRequestId||$(".screen.active")?.id!==requestedScreen){
      stopMic();return;
    }
    const source=state.micContext.createMediaStreamSource(state.micStream),analyser=state.micContext.createAnalyser();
    analyser.fftSize=8192;analyser.smoothingTimeConstant=.05;source.connect(analyser);
    const buffer=new Float32Array(analyser.fftSize);state.micEnabled=true;state.micStarting=false;
    const activeMicToggle=$("#mic-toggle");if(activeMicToggle){activeMicToggle.disabled=false;activeMicToggle.textContent="VYPNOUT MIKROFON";}
    const micStatus=$("#mic-status");if(micStatus)micStatus.textContent="Mikrofon aktivní · poslouchám";
    if(state.micTargetActive){
      const targetStatus=$("#mic-target-status");if(targetStatus)targetStatus.textContent="Mikrofon poslouchá · zahraj vybraný tón";
      const targetButton=$("#mic-target-listen");if(targetButton)targetButton.textContent="ZASTAVIT POSLECH";
    }
    let lastAnalysisAt=0;
    const detect=()=>{
      if(!state.micEnabled||!state.micContext)return;
      const now=performance.now();
      if(now-lastAnalysisAt>=45){
        lastAnalysisAt=now;analyser.getFloatTimeDomainData(buffer);
        const rawHz=detectPitch(buffer,state.micContext.sampleRate);
        const hz=stabilizeMicPitch(rawHz);
        if(hz>30&&hz<450){
          if(state.micTargetActive)handleMicTargetPitch(hz);
          else if(state.micTestActive)handleMicTestPitch(hz);
          else handleSongPitch(hz);
        }
      }
      if(state.micEnabled)state.micFrame=requestAnimationFrame(detect);
    };detect();
  }catch(error){
    if(requestId!==state.micRequestId)return;
    stopMic();
    const message="Mikrofon se nepodařilo zapnout ["+(error.name||"neznámá chyba")+"]: "+(error.message||error);
    const micStatus=$("#mic-status");if(micStatus)micStatus.textContent=message;
    const feedback=$("#player-feedback");if(feedback)feedback.textContent=message;
    const testLive=$("#mic-test-live");if(testLive)testLive.textContent=message;
    const targetStatus=$("#mic-target-status");if(targetStatus)targetStatus.textContent=message;
  }
}
function detectPitch(buffer,sampleRate){
  let mean=0;for(let i=0;i<buffer.length;i+=4)mean+=buffer[i];mean/=buffer.length/4;
  let energy=0;
  for(let i=0;i<buffer.length;i+=4){const value=buffer[i]-mean;energy+=value*value;}
  const rms=Math.sqrt(energy/(buffer.length/4));if(rms<.0045)return -1;
  const minLag=Math.max(2,Math.floor(sampleRate/430));
  const maxLag=Math.min(Math.floor(sampleRate/32),Math.floor(buffer.length/2));
  const difference=new Float64Array(maxLag+1),normalized=new Float64Array(maxLag+1);
  const sampleStride=8;
  for(let lag=minLag;lag<=maxLag;lag++){
    let sum=0;
    for(let i=0;i<buffer.length-lag;i+=sampleStride){
      const delta=(buffer[i]-mean)-(buffer[i+lag]-mean);sum+=delta*delta;
    }
    difference[lag]=sum;
  }
  let cumulative=0,bestLag=-1,bestValue=1;
  for(let lag=minLag;lag<=maxLag;lag++){
    cumulative+=difference[lag];
    normalized[lag]=difference[lag]*(lag-minLag+1)/Math.max(1e-12,cumulative);
    if(normalized[lag]<bestValue){bestValue=normalized[lag];bestLag=lag;}
  }
  let chosen=-1;
  for(let lag=minLag+1;lag<maxLag;lag++){
    if(normalized[lag]<.22){
      while(lag+1<maxLag&&normalized[lag+1]<normalized[lag])lag++;
      chosen=lag;break;
    }
  }
  if(chosen<0&&bestValue<.34)chosen=bestLag;
  if(chosen<0)return -1;
  const left=normalized[Math.max(minLag,chosen-1)],center=normalized[chosen],right=normalized[Math.min(maxLag,chosen+1)];
  const denominator=left-2*center+right;
  const shift=Math.abs(denominator)>1e-9?Math.max(-.5,Math.min(.5,.5*(left-right)/denominator)):0;
  return sampleRate/(chosen+shift);
}
function stabilizeMicPitch(hz){
  if(!Number.isFinite(hz)||hz<30||hz>450){state.micPitchCandidateHz=0;state.micPitchCandidateFrames=0;return -1;}
  if(state.micPitchCandidateHz>0&&Math.abs(1200*Math.log2(hz/state.micPitchCandidateHz))<85){
    state.micPitchCandidateHz=state.micPitchCandidateHz*.65+hz*.35;
    state.micPitchCandidateFrames++;
  }else{
    state.micPitchCandidateHz=hz;state.micPitchCandidateFrames=1;
  }
  return state.micPitchCandidateFrames>=2?state.micPitchCandidateHz:-1;
}

$("#mic-toggle").onclick=()=>state.micEnabled?stopMic():startMic();

const TEST_STRINGS=[{name:"E1",string:"E",hz:41.2034},{name:"A1",string:"A",hz:55},{name:"D2",string:"D",hz:73.4162},{name:"G2",string:"G",hz:97.9989}];
function beginMicTargetListen(){
  if(state.micTargetActive){stopMic();return;}
  stopMic();state.micTestActive=false;state.micTargetActive=true;state.micTargetGoodFrames=0;
  $("#mic-target-status").textContent="Žádám o přístup k mikrofonu…";
  $("#mic-target-listen").textContent="SPOUŠTÍM…";
  startMic().then(()=>{
    if(state.micEnabled&&state.micTargetActive)$("#mic-target-status").textContent="Mikrofon poslouchá · zahraj vybraný tón";
  });
}
function handleMicTargetPitch(hz){
  const string=$("#mic-target-string").value;
  const fret=Math.max(0,Math.min(24,Number($("#mic-target-fret").value)||0));
  const target=noteFrequency(string,fret)*Math.pow(2,(state.aiProfile.strings[string]?.offsetCents||0)/1200);
  const cents=1200*Math.log2(hz/target);
  const label=string+" · pražec "+fret;
  if(Math.abs(cents)<=75){
    state.micTargetGoodFrames++;
    $("#mic-target-status").textContent="Slyším "+hz.toFixed(1)+" Hz · "+(cents>=0?"+":"")+cents.toFixed(0)+" centů · "+label;
    if(state.micTargetGoodFrames>=3){
      stopMic(true);
      $("#mic-target-status").textContent="Rozpoznáno: "+label+" · "+hz.toFixed(1)+" Hz";
      $("#mic-target-listen").textContent="ZKUSIT ZNOVU";
    }
  }else{
    state.micTargetGoodFrames=0;
    $("#mic-target-status").textContent="Slyším "+hz.toFixed(1)+" Hz · očekávám "+label;
  }
}
$("#mic-target-listen").onclick=beginMicTargetListen;

function renderAiCoach(){
  const names=STRINGS;const learned=names.reduce((total,key)=>total+(state.aiProfile.strings[key]?.samples||0),0);
  $("#ai-status").textContent=learned?"Adaptivní kalibrace aktivní · "+state.aiProfile.tests+" dokončených testů":"AI čeká na první kalibraci.";
  $("#ai-profile").innerHTML=names.map(key=>{
    const p=state.aiProfile.strings[key]||{offsetCents:0,samples:0,meanAbsError:0,errors:0};
    const detail=p.samples?p.offsetCents.toFixed(1)+" centů · "+p.samples+" vzorků":"čeká na data";
    return '<div class="ai-string-row"><b>'+key+'</b><span>'+detail+" · chyb "+(p.errors||0)+"</span></div>";
  }).join("")+"<p>Naučené vzorky: "+learned+" · poslední test: "+(state.aiProfile.lastAccuracy||0)+" %</p>";
}
function renderMicTest(){
  renderAiCoach();const done=state.micTestResults.length;
  $("#mic-test-progress").style.width=(done/4*100)+"%";
  $("#mic-test-step").textContent=done>=4?"TEST DOKONČEN":"KROK "+(done+1)+" / 4";
  const item=TEST_STRINGS[Math.min(done,3)];$("#mic-test-note").textContent=done>=4?"100 %":item.name;
  $("#mic-test-instruction").textContent=done<4?"Zahraj otevřenou strunu "+item.name+".":"Test dokončen.";
  $("#mic-test-report").textContent=state.micTestHistory.length?"Předchozí testy: "+state.micTestHistory.length+" · poslední úspěšnost "+state.micTestHistory[state.micTestHistory.length-1].accuracy+" %":"Po testu se zde zobrazí výsledek.";
}
async function beginMicTest(){
  stopMic();state.micTestActive=true;state.micTestIndex=0;state.micTestResults=[];state.lastDetectedAt=0;
  renderMicTest();$("#mic-test-live").textContent="Žádám o přístup k mikrofonu…";await startMic();
  if(state.micEnabled)$("#mic-test-live").textContent="Mikrofon poslouchá · zahraj E1";
}
function handleMicTestPitch(hz){
  const item=TEST_STRINGS[state.micTestIndex];if(!item)return;
  const cents=1200*Math.log2(hz/item.hz);
  $("#mic-test-live").textContent="Zachyceno "+hz.toFixed(1)+" Hz · "+(cents>=0?"+":"")+cents.toFixed(0)+" centů";
  if(Math.abs(cents)<=85&&performance.now()-state.lastDetectedAt>900){
    state.lastDetectedAt=performance.now();state.micTestResults.push({string:item.string,expected:item.hz,detected:hz,cents,ok:true});
    state.micTestIndex++;
    if(state.micTestIndex>=4)completeMicTest();
    else{renderMicTest();$("#mic-test-live").textContent="Rozpoznáno "+item.name+" · teď zahraj "+TEST_STRINGS[state.micTestIndex].name;}
  }
}
function completeMicTest(){
  state.aiProfile.tests++;state.aiProfile.lastAccuracy=Math.round(state.micTestResults.length/4*100);
  state.micTestResults.forEach(r=>recordAI(r.string,r.cents,true));
  localStorage.setItem("bh-ai-profile",JSON.stringify(state.aiProfile));
  state.micTestActive=false;stopMic();
  const report={date:new Date().toISOString(),accuracy:100,results:state.micTestResults};state.micTestHistory.push(report);state.micTestHistory=state.micTestHistory.slice(-20);
  localStorage.setItem("bh-mic-tests",JSON.stringify(state.micTestHistory));
  $("#mic-test-step").textContent="TEST DOKONČEN";$("#mic-test-note").textContent="100 %";
  $("#mic-test-instruction").textContent="Rozpoznány všechny čtyři otevřené struny.";
  $("#mic-test-live").textContent=state.micTestResults.map(x=>x.string+": "+x.detected.toFixed(1)+" Hz").join(" · ");
  $("#mic-test-progress").style.width="100%";$("#mic-test-start").textContent="OPAKOVAT TEST";
  $("#mic-test-report").textContent="Poslední výsledek: 100 % · testů v telefonu: "+state.micTestHistory.length+".";
  renderAiCoach();
}
$("#mic-test-start").onclick=beginMicTest;
$("#mic-test-reset").onclick=()=>{
  state.micTestActive=false;stopMic();state.micTestResults=[];state.micTestHistory=[];
  localStorage.removeItem("bh-mic-tests");$("#mic-test-start").textContent="SPUSTIT TEST";
  $("#mic-test-live").textContent="Zatím žádný tón nezachycen";$("#mic-test-progress").style.width="0%";
  renderMicTest();$("#mic-test-report").textContent="Historie testů byla vymazána.";
};
$("#ai-reset").onclick=()=>{state.aiProfile=DEFAULT_AI();localStorage.setItem("bh-ai-profile",JSON.stringify(state.aiProfile));renderAiCoach();};
renderMicTest();

function parseAsciiTab(text,title,bpm){
  const rows={};
  text.split(/\r?\n/).forEach(line=>{
    const match=line.match(/^\s*([GDAE])\s*\|(.*)$/i);
    if(match){
      const string=match[1].toUpperCase();
      const content=match[2].trim().replace(/^\|+|\|+$/g,"");
      rows[string]=rows[string]?rows[string]+"|"+content:content;
    }
  });
  if(!["G","D","A","E"].every(s=>typeof rows[s]==="string"))throw new Error("Tab musí obsahovat čtyři řádky označené G, D, A a E.");
  const splitRows={};let barCount=0;
  STRINGS.forEach(s=>{splitRows[s]=rows[s].split("|");if(splitRows[s].length&&splitRows[s][splitRows[s].length-1]==="")splitRows[s].pop();barCount=Math.max(barCount,splitRows[s].length);});
  const notes=[];let serial=0;
  for(let bar=0;bar<barCount;bar++){
    const segments=STRINGS.map(s=>splitRows[s][bar]||"");const maxWidth=Math.max(segments[0].length,segments[1].length,segments[2].length,segments[3].length,1);
    STRINGS.forEach(string=>{
      const segment=splitRows[string][bar]||"";
      const regex=/(\d{1,2}(?:[hp\/\\b]\d{1,2}|~)?r?|x)/gi;let match;
      const hasPalmMuting=/\bPM\b/i.test(segment);
      while((match=regex.exec(segment))!==null){
        const raw=match[1];const first=raw.match(/^(\d{1,2})/);const muted=/^x$/i.test(raw);
        let fret=muted?0:Number(first?first[1]:0);if(fret>24)continue;
        const suffix=first?raw.slice(first[1].length):"";let technique=muted?"muted note":"";
        if(suffix){
          const symbol=suffix[0].toLowerCase();
          const labels={h:"hammer-on",p:"pull-off","/":"slide up","\\":"slide down",b:"bend","~":"vibrato",r:"release"};
          technique=labels[symbol]||"technique";
          const target=suffix.slice(1).match(/^(\d{1,2})/);if(target)fret=Number(target[1]);
          if(/r/i.test(suffix)&&symbol!=="r")technique+=" · release";
        }
        if(hasPalmMuting)technique+=(technique?" · ":"")+"palm muting";
        const beat=Math.round((bar*4+(match.index/maxWidth)*4)*4)/4;
        notes.push({id:"import-"+serial++,beat,string,fret,duration:.5,technique,display:raw+(hasPalmMuting?" PM":""),status:"pending",wrongRecorded:false,muted});
      }
    });
  }
  if(!notes.length)throw new Error("V tabulatuře jsem nenašel žádné platné noty.");
  notes.sort((a,b)=>a.beat-b.beat);
  notes.forEach((note,index)=>{
    const next=notes.slice(index+1).find(item=>item.beat>note.beat);
    note.duration=next?Math.max(.125,Math.min(4,next.beat-note.beat)):.5;
  });
  return {id:"custom-"+Date.now(),title:title||"Importovaná tabulatura",bpm:Math.max(30,Math.min(240,Number(bpm)||90)),bars:barCount,totalBeats:barCount*4,notes,description:"Vlastní importovaná tabulatura"};
}
function normalizeImportedSong(data){
  if(!data||!Array.isArray(data.notes)||!data.notes.length)throw new Error("Soubor neobsahuje platné noty.");
  if(data.notes.length>100000)throw new Error("Tabulatura obsahuje příliš mnoho not.");
  const notes=data.notes.map((n,i)=>{
    const string=String(n.string||n.lane||"").toUpperCase();
    const rawFret=Number(n.fret);
    const rawBeat=Number(n.beat??0);
    const rawDuration=Number(n.duration??.5);
    if(!STRINGS.includes(string)||!Number.isFinite(rawFret)||rawFret<0||rawFret>24||!Number.isFinite(rawBeat)||rawBeat<0)throw new Error("Některá nota má neplatnou strunu, pražec nebo čas.");
    const fret=Math.round(rawFret);
    const duration=Number.isFinite(rawDuration)&&rawDuration>0?Math.max(.125,Math.min(16,rawDuration)):.5;
    const rawOffset=Number(n.offsetMs);
    const offsetMs=Number.isFinite(rawOffset)?Math.max(-500,Math.min(500,rawOffset)):0;
    const muted=Boolean(n.muted)||String(n.display||"").toLowerCase()==="x"||String(n.technique||"")==="muted note";
    return {id:"json-"+i,beat:rawBeat,string,fret,duration,technique:String(n.technique||""),display:muted?"x":String(n.display||fret),offsetMs,muted,status:"pending",wrongRecorded:false};
  }).sort((a,b)=>a.beat-b.beat);
  const inferredBeats=Math.ceil((notes[notes.length-1].beat+notes[notes.length-1].duration)/4)*4;
  const rawTotalBeats=Number(data.totalBeats);
  const requestedBeats=Number.isFinite(rawTotalBeats)&&rawTotalBeats>=4?Math.min(100000,rawTotalBeats):4;
  const totalBeats=Math.max(4,Math.min(100000,Math.max(requestedBeats,inferredBeats)));
  const rawSyncOffset=Number(data.syncOffsetMs);
  const syncOffsetMs=Number.isFinite(rawSyncOffset)?Math.max(-500,Math.min(500,rawSyncOffset)):0;
  return {id:"custom-"+Date.now(),title:String(data.title||"Importovaná skladba").slice(0,60),bpm:Math.max(30,Math.min(240,Number(data.bpm)||90)),bars:Math.ceil(totalBeats/4),totalBeats,syncOffsetMs,notes,description:"Vlastní importovaná tabulatura"};
}
function saveCustomSong(song){
  song.id=song.id&&song.id.startsWith("custom-")?song.id:"custom-"+Date.now();
  const existing=state.savedTabs.findIndex(s=>s.id===song.id);
  const stored={...song,notes:song.notes.map(n=>({...n,status:"pending",wrongRecorded:false}))};
  if(existing>=0)state.savedTabs[existing]=stored;else state.savedTabs.push(stored);
  localStorage.setItem("bh-saved-tabs",JSON.stringify(state.savedTabs));
  renderSavedTabs();renderSongList();
}
function parseEditor(){
  const title=$("#tab-title").value.trim()||"Moje tabulatura";const bpm=Number($("#tab-bpm").value)||90;
  return parseAsciiTab($("#tab-input").value,title,bpm);
}
$("#parse-tab").onclick=()=>{
  try{const song=parseEditor();$("#editor-message").textContent="Tab je platný: "+song.notes.length+" tónů · "+song.bars+" taktů · "+song.bpm+" BPM.";renderMiniPreview(song);}
  catch(error){$("#editor-message").textContent=error.message;}
};
$("#save-tab").onclick=()=>{
  try{const song=parseEditor();saveCustomSong(song);$("#editor-message").textContent="Tab uložen v knihovně tohoto telefonu.";renderMiniPreview(song);}
  catch(error){$("#editor-message").textContent=error.message;}
};
function renderMiniPreview(song){
  const target=$("#editor-preview");target.innerHTML="";
  const preview=document.createElement("div");preview.className="tab-canvas";
  const old=state.song;state.song=song;const canvas=$("#tab-canvas");const original=canvas.innerHTML;renderTab();preview.innerHTML=canvas.innerHTML;canvas.innerHTML=original;state.song=old;
  target.append(preview);
}
function renderSavedTabs(){
  const box=$("#saved-tabs");if(!box)return;box.innerHTML="";
  state.savedTabs.forEach(song=>{
    const row=document.createElement("div");row.className="saved-tab";
    const title=document.createElement("span");title.textContent=song.title+" · "+song.notes.length+" tónů";
    const play=document.createElement("button");play.className="primary-button";play.textContent="OTEVŘÍT";play.onclick=()=>openSong(song);
    row.append(title,play);box.append(row);
  });
}
$("#tab-file").onchange=e=>{
  const file=e.target.files&&e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const content=String(reader.result||"");
      if(file.name.toLowerCase().endsWith(".json")){
        const data=JSON.parse(content);
        const imported=Array.isArray(data.songs)?data.songs.map(normalizeImportedSong):[normalizeImportedSong(data)];
        imported.forEach((song,index)=>{song.id="custom-import-"+Date.now()+"-"+index;saveCustomSong(song);});
        $("#editor-message").textContent="Importováno "+imported.length+" tabů ve formátu Bass Hero JSON.";
        if(imported[0])$("#tab-title").value=imported[0].title;
      }else{
        const song=parseAsciiTab(content,file.name.replace(/\.[^.]+$/,""),90);
        saveCustomSong(song);$("#editor-message").textContent="Importováno: "+song.title+" · "+song.notes.length+" tónů.";
        $("#tab-title").value=song.title;$("#tab-input").value=content;
      }
      show("editor-screen");
    }catch(error){alert("Import se nepodařil: "+error.message);}
    e.target.value="";
  };
  reader.onerror=()=>alert("Soubor se nepodařilo přečíst.");reader.readAsText(file);
};
$("#export-tabs").onclick=()=>{
  const data={format:"bass-hero-tab",version:1,songs:state.savedTabs.map(song=>({title:song.title,bpm:song.bpm,bars:song.bars,totalBeats:song.totalBeats,syncOffsetMs:song.syncOffsetMs||0,notes:song.notes.map(n=>({beat:n.beat,string:n.string,fret:n.fret,duration:n.duration,technique:n.technique,display:n.display,offsetMs:n.offsetMs||0,muted:Boolean(n.muted)}))}))};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="bass-hero-tabs.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
};

$("#music-volume").oninput=e=>{state.musicVolume=Number(e.target.value);$("#music-volume-value").textContent=Math.round(state.musicVolume*100)+" %";if(state.audioElement)state.audioElement.volume=state.musicVolume;localStorage.setItem("bh-music-volume",String(state.musicVolume));};
$("#guide-volume").oninput=e=>{state.guideVolume=Number(e.target.value);$("#guide-volume-value").textContent=Math.round(state.guideVolume*100)+" %";localStorage.setItem("bh-guide-volume",String(state.guideVolume));};
$("#music-volume").value=state.musicVolume;$("#guide-volume").value=state.guideVolume;
$("#music-volume-value").textContent=Math.round(state.musicVolume*100)+" %";$("#guide-volume-value").textContent=Math.round(state.guideVolume*100)+" %";

$("#default-speed").value=localStorage.getItem("bh-speed")||"1";
$("#default-play-mode").value=localStorage.getItem("bh-play-mode")||"wait";
$("#default-sound-mode").value=localStorage.getItem("bh-sound-mode")||"original";
$("#countdown").value=localStorage.getItem("bh-countdown")||"5";
$("#default-speed").onchange=e=>{localStorage.setItem("bh-speed",e.target.value);};
$("#default-play-mode").onchange=e=>localStorage.setItem("bh-play-mode",e.target.value);
$("#default-sound-mode").onchange=e=>localStorage.setItem("bh-sound-mode",e.target.value);
$("#countdown").onchange=e=>{state.countdown=Number(e.target.value);localStorage.setItem("bh-countdown",e.target.value);};
state.countdown=Number($("#countdown").value);
$("#language").onchange=e=>{if(e.target.value==="en")$("#language").value="cs";};

function renderStats(){
  const stats=state.globalStats;const total=stats.hits+stats.misses;const accuracy=total?Math.round(stats.hits/total*100):0;
  $("#stat-songs").textContent=stats.completed||0;$("#stat-accuracy").textContent=accuracy+" %";$("#stat-notes").textContent=stats.hits||0;$("#stat-practice").textContent=Math.round((stats.seconds||0)/60)+" min";
  const box=$("#song-stats");box.innerHTML="";
  const all=DEMO_SONGS.concat(state.savedTabs);
  all.forEach(song=>{
    const item=state.songStats[song.id];if(!item)return;
    const row=document.createElement("div");row.className="song-stat";
    const label=document.createElement("span");label.textContent=song.title+" · nejlepší "+item.bestAccuracy+" % · "+item.plays+"×";
    const btn=document.createElement("button");btn.className="secondary-button";btn.textContent="HRÁT";btn.onclick=()=>openSong(song);
    row.append(label,btn);box.append(row);
  });
  if(!box.children.length)box.textContent="Zatím tu nejsou žádné dokončené skladby.";
}
$("#reset-stats").onclick=()=>{
  if(confirm("Opravdu vymazat všechny výsledky skladeb?")){
    state.songStats={};state.globalStats={completed:0,hits:0,misses:0,seconds:0};
    localStorage.setItem("bh-song-stats",JSON.stringify(state.songStats));localStorage.setItem("bh-global-stats",JSON.stringify(state.globalStats));renderStats();
  }
};

renderSongList();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
