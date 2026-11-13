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
  micStream:null,micContext:null,micFrame:0,micEnabled:false,lastDetectedAt:0,micTestActive:false,micTestIndex:0,micTestResults:[],micTestHistory:readJSON("bh-mic-tests",()=>[])
};

state.musicVolume=Number(localStorage.getItem("bh-music-volume")||".65");
state.guideVolume=Number(localStorage.getItem("bh-guide-volume")||".15");
state.musicVolume=Math.max(0,Math.min(1,state.musicVolume));
state.guideVolume=Math.max(0,Math.min(1,state.guideVolume));
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

function show(id){
  if(id!=="player-screen" && state.micTestActive){state.micTestActive=false;stopMic();}
  $$(".screen").forEach(el=>el.classList.toggle("active",el.id===id));
  if(id==="stats-screen")renderStats();
  if(id==="editor-screen")renderSavedTabs();
  if(id==="mic-test-screen")renderMicTest();
  if(id==="tabs-screen")renderSongList();
}
$$("[data-screen]").forEach(btn=>btn.addEventListener("click",()=>show(btn.dataset.screen)));
$("#settings-shortcut").onclick=()=>show("settings-screen");
$("#open-editor").onclick=()=>show("editor-screen");
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
  state.song={...song,notes:song.notes.map((n,i)=>({...n,id:song.id+"-"+i,status:"pending",wrongRecorded:false}))};
  state.currentIndex=0;state.hits=0;state.misses=0;state.currentBeat=0;state.startBeat=0;state.waiting=false;state.previewing=false;state.guidePlayed=new Set();state.lastSynthStep=-1;
  const progress=state.progress[song.id];
  state.resumeBeat=progress&&progress.beat>0&&progress.beat<song.totalBeats?progress.beat:0;
  $("#song-title").textContent=song.title;$("#song-subtitle").textContent=song.bpm+" BPM · "+song.bars+" taktů · "+song.description;
  $("#play-mode").value=localStorage.getItem("bh-play-mode")||"wait";
  $("#sound-mode").value=localStorage.getItem("bh-sound-mode")||"original";
  $("#player-speed").value=localStorage.getItem("bh-speed")||"1";
  $("#player-resume").style.display=state.resumeBeat>0?"inline-block":"none";
  $("#audio-file-label").textContent=state.audioSources[song.id]?"Vlastní audio připojeno":"Demo používá vytvořený doprovod";
  state.speed=Number($("#player-speed").value);state.playMode=$("#play-mode").value;state.soundMode=$("#sound-mode").value;
  $("#sound-mode-note").textContent=state.soundMode==="bass-sync"?"Bass Sync zvýrazní rytmus a nástupy basové linky. U smíchaného MP3 zůstává původní mix pohromadě.":"Original přehraje připojenou nahrávku, nebo plnější demo doprovod.";
  if(state.audioSources[song.id])setAudioSource(state.audioSources[song.id],false);else setAudioSource(null,false);
  renderTab();updatePlayerUI(0);show("player-screen");
  $("#player-feedback").textContent="Připraveno. Zapni mikrofon a spusť skladbu.";
}
function previewSong(song){
  openSong(song);state.previewPreviousMode=state.playMode;state.previewing=true;state.playMode="flow";$("#play-mode").value="flow";
  $("#player-feedback").textContent="Přehrává se krátká ukázka skladby.";
  startPlayer(true);
}
function renderTab(){
  const canvas=$("#tab-canvas");if(!canvas||!state.song)return;
  canvas.innerHTML="";
  const playhead=document.createElement("div");playhead.className="tab-playhead";playhead.id="tab-playhead";canvas.append(playhead);
  for(let bar=0;bar<state.song.bars;bar++){
    const block=document.createElement("div");block.className="tab-bar";block.dataset.bar=String(bar);
    const label=document.createElement("div");label.className="bar-label";label.textContent=String(bar+1);block.append(label);
    TOP_STRINGS.forEach(str=>{
      const row=document.createElement("div");row.className="tab-string";row.dataset.string=str;
      const sl=document.createElement("span");sl.className="string-label";sl.textContent=str;row.append(sl);
      state.song.notes.filter(n=>n.string===str&&Math.floor(n.beat/4)===bar).forEach(note=>{
        const mark=document.createElement("span");mark.className="tab-note string-"+str;mark.dataset.noteId=note.id;mark.textContent=note.display||String(note.fret);
        const beatInBar=note.beat%4;mark.style.left=(12+(beatInBar/4)*130)+"px";
        mark.style.transform="translateX(0)";
        mark.style.width=Math.max(18,Math.min(130-(beatInBar/4)*130,Math.round((note.duration||.5)*30)))+"px";
        if(note.technique)mark.title=note.technique;
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
    const width=154;playhead.style.left=(8+(safeBeat/4)*width)+"px";
    const viewport=$("#tab-viewport");const x=8+(safeBeat/4)*width;
    if(state.playing||state.waiting){const desired=Math.max(0,x-viewport.clientWidth*.32);if(Math.abs(viewport.scrollLeft-desired)>55)viewport.scrollTo({left:desired,behavior:"smooth"});}
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
$("#load-audio").onclick=()=>$("#audio-file").click();
$("#audio-file").onchange=e=>{const file=e.target.files&&e.target.files[0];if(file)setAudioSource(file,true);};
$("#play-mode").onchange=e=>{state.playMode=e.target.value;localStorage.setItem("bh-play-mode",state.playMode);};
$("#sound-mode").onchange=e=>{state.soundMode=e.target.value;localStorage.setItem("bh-sound-mode",state.soundMode);$("#sound-mode-note").textContent=state.soundMode==="bass-sync"?"Bass Sync zvýrazní rytmus a nástupy basové linky. U smíchaného MP3 zůstává původní mix pohromadě.":"Original přehraje připojenou nahrávku, nebo plnější demo doprovod."};
$("#player-speed").onchange=e=>{
  const oldSpeed=state.speed;const now=performance.now();
  if(state.playing&&state.song){const beat=state.startBeat+(now-state.startAt)/(60000/state.song.bpm/oldSpeed);state.startBeat=beat;state.startAt=now;}
  state.speed=Number(e.target.value);localStorage.setItem("bh-speed",String(state.speed));
  if(state.audioElement)state.audioElement.playbackRate=state.speed;
};

function stopAudioAtCurrentBeat(){
  if(state.audioElement){state.audioElement.pause();return;}
}
function startAudioAtBeat(beat){
  if(state.audioElement){
    state.audioElement.currentTime=Math.max(0,beat*60/state.song.bpm);
    state.audioElement.volume=state.musicVolume;state.audioElement.playbackRate=state.speed;
    state.audioElement.play().catch(()=>{$("#player-feedback").textContent="Přehrávání nahrávky se nepodařilo spustit."});
  }
  state.lastSynthStep=Math.floor(beat*2)-1;
}
function stopPlayback(save){
  if(state.previewing){state.playMode=state.previewPreviousMode;$("#play-mode").value=state.playMode;}
  if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;
  if(state.countdownTimer)clearTimeout(state.countdownTimer);state.countdownTimer=0;
  if(state.previewTimer)clearTimeout(state.previewTimer);state.previewTimer=0;
  state.playing=false;state.waiting=false;state.previewing=false;
  if(state.audioElement)state.audioElement.pause();
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
  show("player-screen");
  if(state.playing||state.waiting)stopPlayback(false);
  state.previewing=Boolean(isPreview);state.waiting=false;
  state.currentIndex=0;state.song.notes.forEach(n=>{n.status="pending";n.wrongRecorded=false;});
  state.hits=0;state.misses=0;state.guidePlayed=new Set();
  let fromBeat=resume?state.resumeBeat||0:0;
  state.currentIndex=state.song.notes.findIndex(n=>n.beat>=fromBeat);
  if(state.currentIndex<0)state.currentIndex=state.song.notes.length;
  state.currentBeat=fromBeat;state.startBeat=fromBeat;
  renderTab();updatePlayerUI(fromBeat);
  const begin=()=>{
    state.playing=true;state.startAt=performance.now();state.sessionStartedAt=state.startAt;state.lastSynthStep=Math.floor(fromBeat*2)-1;
    $("#player-state").textContent=state.previewing?"UKÁZKA":"PŘEHRÁVÁNÍ";
    $("#player-feedback").textContent=state.previewing?"Krátká ukázka běží…":state.playMode==="wait"?"Čekám na první tón.":"Hraj podle běžící tabulatury.";
    startAudioAtBeat(fromBeat);
    if(state.previewing){state.previewStartedAt=performance.now();state.previewTimer=setTimeout(()=>{stopPlayback(false);state.playMode=state.previewPreviousMode;$("#play-mode").value=state.playMode;$("#player-feedback").textContent="Ukázka dokončena. Teď můžeš spustit celou skladbu.";$("#player-state").textContent="UKÁZKA HOTOVÁ";},8000);}
    state.raf=requestAnimationFrame(playerTick);
  };
  if(!isPreview&&!resume&&state.countdown>0){
    let left=state.countdown;$("#player-state").textContent="ODPOČET";$("#player-feedback").textContent="Začínáme za "+left+"…";
    const count=()=>{left--;if(left>0){$("#player-feedback").textContent="Začínáme za "+left+"…";state.countdownTimer=setTimeout(count,1000);}else begin();};
    state.countdownTimer=setTimeout(count,1000);
  }else begin();
}
function playerTick(now){
  if(!state.playing||!state.song)return;
  const beat=state.startBeat+(now-state.startAt)/(60000/state.song.bpm/state.speed);
  runAudioStep(beat);
  if(state.playMode==="wait"){
    const note=findNextNote();
    if(note&&beat>=note.beat){
      state.waiting=true;state.playing=false;state.currentIndex=state.song.notes.indexOf(note);state.currentBeat=note.beat;
      stopAudioAtCurrentBeat();$("#player-state").textContent="ČEKÁM NA TÓN";
      $("#player-feedback").textContent="Zahraj "+note.string+" · pražec "+note.display+". Při chybě se tón zopakuje.";
      updatePlayerUI(note.beat);playGuideNote(note);return;
    }
  }else{
    const pending=findNextNote();
    if(pending&&beat>pending.beat+.62){
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
    const beat=state.startBeat+(performance.now()-state.startAt)/(60000/state.song.bpm/state.speed);
    if(beat>=note.beat-.45&&beat<=note.beat+.62){
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
  state.waiting=false;state.playing=true;state.startBeat=note.beat;state.startAt=performance.now();
  startAudioAtBeat(note.beat);$("#player-state").textContent="PŘEHRÁVÁNÍ";
  state.raf=requestAnimationFrame(playerTick);
  updatePlayerUI(note.beat);
}
function handleSongPitch(hz){
  if(state.previewing||!state.song||(!state.playing&&!state.waiting))return;
  const note=state.waiting?state.song.notes[state.currentIndex]:findNextNote();
  if(!note||note.muted)return;
  const target=noteFrequency(note.string,note.fret)*Math.pow(2,(state.aiProfile.strings[note.string]?.offsetCents||0)/1200);
  const cents=1200*Math.log2(hz/target);
  const tolerance=state.waiting?75:65;
  if(Math.abs(cents)<=tolerance){
    if(performance.now()-state.lastDetectedAt<650)return;
    state.lastDetectedAt=performance.now();
    if(state.waiting){hitWaitingNote(cents);return;}
    const currentBeat=state.startBeat+(performance.now()-state.startAt)/(60000/state.song.bpm/state.speed);
    if(currentBeat>=note.beat-.45&&currentBeat<=note.beat+.62){
      setNoteStatus(note,"hit");state.hits++;recordAI(note.string,cents,true);state.currentIndex=state.song.notes.indexOf(note)+1;
      $("#player-feedback").textContent="Správně · "+note.string+" "+note.display;updatePlayerUI(currentBeat);
    }
  }else if(state.waiting){
    if(performance.now()-state.lastDetectedAt>850){
      state.lastDetectedAt=performance.now();state.misses++;recordAI(note.string,cents,false);
      $("#player-feedback").textContent="Mimo tón · zkus znovu "+note.string+" "+note.display;
    }
  }else if(!note.wrongRecorded&&Math.abs(cents)>tolerance){
    const currentBeat=state.startBeat+(performance.now()-state.startAt)/(60000/state.song.bpm/state.speed);
    if(currentBeat>=note.beat-.25&&currentBeat<=note.beat+.55){
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

function stopMic(){
  state.micEnabled=false;if(state.micFrame)cancelAnimationFrame(state.micFrame);
  if(state.micStream)state.micStream.getTracks().forEach(t=>t.stop());
  if(state.micContext)state.micContext.close().catch(()=>{});
  state.micStream=null;state.micContext=null;state.micFrame=0;
  $("#mic-toggle").textContent="ZAPNOUT MIKROFON";$("#mic-status").textContent="Mikrofon vypnutý";
}
async function startMic(){
  try{
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error("Mikrofon není dostupný. Zkontroluj oprávnění aplikace.");
    state.micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    state.micContext=new (window.AudioContext||window.webkitAudioContext)();await state.micContext.resume();
    const source=state.micContext.createMediaStreamSource(state.micStream),analyser=state.micContext.createAnalyser();
    analyser.fftSize=8192;analyser.smoothingTimeConstant=.05;source.connect(analyser);
    const buffer=new Float32Array(analyser.fftSize);state.micEnabled=true;
    $("#mic-toggle").textContent="VYPNOUT MIKROFON";$("#mic-status").textContent="Mikrofon aktivní · poslouchám";
    const detect=()=>{
      if(!state.micEnabled)return;
      analyser.getFloatTimeDomainData(buffer);const hz=detectPitch(buffer,state.micContext.sampleRate);
      if(hz>30&&hz<450){
        if(state.micTestActive)handleMicTestPitch(hz);
        else handleSongPitch(hz);
      }
      state.micFrame=requestAnimationFrame(detect);
    };detect();
  }catch(error){
    stopMic();const message="Mikrofon se nepodařilo zapnout: "+(error.message||error);
    $("#mic-status").textContent=message;$("#player-feedback").textContent=message;$("#mic-test-live").textContent=message;
  }
}
function detectPitch(buffer,sampleRate){
  let rms=0;for(let i=0;i<buffer.length;i++)rms+=buffer[i]*buffer[i];rms=Math.sqrt(rms/buffer.length);if(rms<.008)return -1;
  let bestLag=-1,best=-1;const minLag=Math.floor(sampleRate/450),maxLag=Math.min(Math.floor(sampleRate/32),buffer.length/2);
  for(let lag=minLag;lag<=maxLag;lag+=4){let sum=0;for(let i=0;i<buffer.length-lag;i+=8)sum+=buffer[i]*buffer[i+lag];if(sum>best){best=sum;bestLag=lag;}}
  return bestLag>0?sampleRate/bestLag:-1;
}
$("#mic-toggle").onclick=()=>state.micEnabled?stopMic():startMic();

const TEST_STRINGS=[{name:"E1",string:"E",hz:41.2034},{name:"A1",string:"A",hz:55},{name:"D2",string:"D",hz:73.4162},{name:"G2",string:"G",hz:97.9989}];
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
  const rows={};text.split(/\r?\n/).forEach(line=>{
    const match=line.match(/^\s*([GDAE])\s*\|(.*)$/i);if(match)rows[match[1].toUpperCase()]=match[2].replace(/\s+$/,"");
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
      const hasPalmMuting=/\bPM\b/i.test(text);
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
  const notes=data.notes.map((n,i)=>{
    const string=String(n.string||n.lane||"").toUpperCase();const fret=Number(n.fret);
    if(!STRINGS.includes(string)||!Number.isFinite(fret)||fret<0||fret>24)throw new Error("Některá nota má neplatnou strunu nebo pražec.");
    return {id:"json-"+i,beat:Math.max(0,Number(n.beat)||0),string,fret,duration:Math.max(.125,Number(n.duration)||.5),technique:String(n.technique||""),display:String(n.display||fret),status:"pending",wrongRecorded:false};
  }).sort((a,b)=>a.beat-b.beat);
  const totalBeats=Math.max(4,Number(data.totalBeats)||Math.ceil((notes[notes.length-1].beat+1)/4)*4);
  return {id:"custom-"+Date.now(),title:String(data.title||"Importovaná skladba").slice(0,60),bpm:Math.max(30,Math.min(240,Number(data.bpm)||90)),bars:Math.ceil(totalBeats/4),totalBeats,notes,description:"Vlastní importovaná tabulatura"};
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
  const data={format:"bass-hero-tab",version:1,songs:state.savedTabs.map(song=>({title:song.title,bpm:song.bpm,bars:song.bars,totalBeats:song.totalBeats,notes:song.notes.map(n=>({beat:n.beat,string:n.string,fret:n.fret,duration:n.duration,technique:n.technique,display:n.display}))}))};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="bass-hero-tabs.json";a.click();URL.revokeObjectURL(url);
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
