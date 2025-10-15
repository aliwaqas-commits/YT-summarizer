const $ = (s)=>document.querySelector(s);
const el=(t,a={},txt)=>{const n=document.createElement(t);Object.entries(a).forEach(([k,v])=>n.setAttribute(k,v));if(txt)n.textContent=txt;return n;};

const state={videoId:null,chunks:[],result:null,dailyLimit:3};
const spinner=()=>document.getElementById('spinner').content.cloneNode(true);
const statusBox=$('#status'), results=$('#results'), historyBox=$('#history'), freemium=$('#freemium');

// THEME toggle
$('#btn-theme').addEventListener('click',()=>{
  const k='theme';
  const next=(localStorage.getItem(k)||'dark')==='dark'?'light':'dark';
  localStorage.setItem(k,next);
  document.documentElement.setAttribute('data-theme',next);
});
document.documentElement.setAttribute('data-theme',localStorage.getItem('theme')||'dark');

// Freemium credits
function getCreditsLeft(){const day=new Date().toISOString().slice(0,10);const key=`credits:${day}`;if(!localStorage.getItem(key))localStorage.setItem(key,String(state.dailyLimit));return{key,left:Number(localStorage.getItem(key))};}
function consumeCredit(){const {key,left}=getCreditsLeft();if(left<=0)return false;localStorage.setItem(key,String(left-1));return true;}
function renderCredits(){const {left}=getCreditsLeft();freemium.innerHTML=left>0?`Free uses left today: <b>${left}</b> of ${state.dailyLimit}.`:`You hit the free limit. <a href="#" id="upsell">Go Pro</a> for unlimited summaries and exports.`;}
renderCredits();

// History utils
function pushHistory(item){const key='history:v1';const list=JSON.parse(localStorage.getItem(key)||'[]');list.unshift(item);localStorage.setItem(key,JSON.stringify(list.slice(0,50)));}
function readHistory(){return JSON.parse(localStorage.getItem('history:v1')||'[]');}
function renderHistory(){const list=readHistory();const wrap=$('#history-list');wrap.innerHTML='';if(!list.length){wrap.textContent='No history yet.';return;}list.forEach(it=>{const div=el('div',{class:'item'});div.append(el('div',{},`📺 ${it.title||it.videoId}`));div.append(el('a',{href:`https://youtu.be/${it.videoId}`,target:'_blank'},'Open'));const btn=el('button',{class:'ghost'},'Reopen');btn.addEventListener('click',()=>{$('#yt-url').value=`https://youtu.be/${it.videoId}`;window.scrollTo({top:0,behavior:'smooth'});});div.append(btn);wrap.append(div);});}

$('#btn-history').addEventListener('click',()=>{historyBox.classList.toggle('hidden');renderHistory();});

// URL form submit
$('#url-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!consumeCredit()){ renderCredits(); return; }
  renderCredits();

  const url=$('#yt-url').value.trim();
  const lang=$('#lang').value;
  const audience=$('#audience').value;
  const length=$('#length').value;

  statusBox.classList.remove('hidden'); statusBox.innerHTML=''; statusBox.append(spinner());
  results.classList.add('hidden');

  try{
    // fetch transcript
    const tRes=await fetch(`/api/transcript?url=${encodeURIComponent(url)}&lang=${encodeURIComponent(lang)}`);
    const tJson=await tRes.json(); if(!tJson.ok) throw new Error(tJson.error||'Transcript failed');
    state.videoId=tJson.videoId; state.chunks=tJson.chunks;

    // summarization
    const sRes=await fetch(`/api/summarize`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ videoId: state.videoId, lang, chunks: state.chunks, style:length, audience,
        include:{chapters:true,quotes:true,seo:true,social:true,quiz:true,keywords:true,sentiment:true}})
    });
    const sJson=await sRes.json(); if(!sJson.ok) throw new Error(sJson.error||'Summarization failed');
    state.result=sJson.result;

    statusBox.classList.add('hidden'); results.classList.remove('hidden');
    renderSummary(state.result); renderChapters(state.result.chapters||[]); renderKeyQuotes(state.result);
    renderSEO(state.result.seo||{}); renderSocial(state.result.social||{}); renderStudy(state.result);
    pushHistory({videoId:state.videoId,title:state.result.title||''});
    buildMarkdown();
  }catch(err){ statusBox.classList.remove('hidden'); statusBox.textContent='Error: '+err.message; }
});

// Rendering helpers
function renderSummary(r){const box=$('#summary-card'); const sent=r.sentiment?` · Sentiment: <b>${r.sentiment}</b>`:''; box.innerHTML=`
  <h2>${esc(r.title||'Summary')}</h2>
  <p>${(r.tl_dr||[]).map(p=>'• '+esc(p)).join('<br>')}</p><hr>
  <p>${esc(r.one_paragraph||'')}</p>
  <ul>${(r.summary_bullets||[]).map(b=>`<li>${esc(b)}</li>`).join('')}</ul>
  <p class="muted">Language: ${esc(r.language||'n/a')}${sent}</p>`;}
function renderChapters(chs){const box=$('#chapters'); if(!chs?.length){box.textContent='No chapters detected.';return;} box.innerHTML=chs.map(ch=>`<div class="row"><a class="timestamp" href="https://youtu.be/${state.videoId}?t=${toSec(ch.start)}" target="_blank">[${ch.start}]</a> <b>${esc(ch.title)}</b><div>${esc(ch.summary||'')}</div></div>`).join('');}
function renderKeyQuotes(r){const box=$('#keyquotes'); const quotes=r.key_quotes||[]; const keywords=r.keywords||[]; box.innerHTML=`<div><b>Key quotes:</b><br>${quotes.map(q=>`“${esc(q.text)}” <a class="timestamp" target="_blank" href="https://youtu.be/${state.videoId}?t=${toSec(q.start)}">[${q.start}]</a>`).join('<br>')}</div><hr><div><b>Keywords:</b> ${keywords.map(k=>`<code>#${esc(k)}</code>`).join(' ')}</div>`;}
function renderSEO(seo){const box=$('#seo'); if(!seo||(!seo.title&&!seo.description)){box.textContent='Not generated.';return;} box.innerHTML=`<div><b>Title:</b> ${esc(seo.title||'')}</div><div><b>Description:</b> ${esc(seo.description||'')}</div><div><b>Tags:</b> ${(seo.tags||[]).map(t=>`<code>${esc(t)}</code>`).join(' ')}</div>`;}
function renderSocial(s){$('#social').innerHTML=`<div><b>Tweet:</b><br>${esc(s.tweet||'')}</div><hr><div><b>LinkedIn:</b><br>${esc(s.linkedin||'')}</div>`;}
function renderStudy(r){const box=$('#study'); const faq=r.faq||[]; const quiz=r.quiz||[]; box.innerHTML=`<div><b>Flashcards (Q → A):</b><br>${faq.map(x=>`<div>Q: ${esc(x.q)}<br>A: ${esc(x.a)}</div>`).join('<br>')}</div><hr>
  <div><b>Quiz:</b><br>${quiz.map((q,i)=>`<div><b>${i+1}.</b> ${esc(q.question)}<br>${q.choices.map((c,ci)=>`<label><input type="radio" name="q${i}"> ${esc(c)}${ci===q.answer_index?' ✅':''}</label>`).join('<br>')}</div>`).join('<br>')}</div>`;}

// Ask form handler
$('#ask-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const q=$('#ask-input').value.trim(); if(!q) return;
  const box=$('#answers'); box.prepend(spinner());
  try{
    const res=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ question:q, chunks: state.chunks })});
    const json=await res.json(); if(!json.ok) throw new Error(json.error);
    const div=el('div',{class:'card'}); div.innerHTML=`<b>Q:</b> ${esc(q)}<br><b>A:</b> ${esc(json.answer)}`; box.prepend(div);
  }catch(err){const div=el('div',{class:'card'},`Error: ${err.message}`); box.prepend(div);} });

// Export to PDF
$('#btn-export-pdf').addEventListener('click', async ()=>{
  const area=$('#results'); const { jsPDF }=window.jspdf; const doc=new jsPDF({ unit:'pt', format:'a4' });
  const canvas=await html2canvas(area,{scale:2, backgroundColor:'#fff'}); const img=canvas.toDataURL('image/png');
  const pageWidth=doc.internal.pageSize.getWidth(); const ratio=canvas.width/canvas.height; const w=pageWidth-40, h=w/ratio;
  doc.addImage(img,'PNG',20,20,w,h); doc.save(`summary_${state.videoId||'video'}.pdf`);
});

// Copy Markdown
let cachedMD=''; function buildMarkdown(){const r=state.result||{};const parts=[];parts.push(`# ${r.title||'Summary'}`);(r.tl_dr||[]).forEach(b=>parts.push(`- ${b}`));parts.push('');parts.push(r.one_paragraph||'');parts.push('');(r.summary_bullets||[]).forEach(b=>parts.push(`- ${b}`));parts.push('\n## Chapters');(r.chapters||[]).forEach(ch=>parts.push(`- [${ch.start}] **${ch.title}** — ${ch.summary}`));parts.push('\n## Quotes');(r.key_quotes||[]).forEach(q=>parts.push(`> "${q.text}" — [${q.start}]`));parts.push('\n## Keywords\n'+(r.keywords||[]).map(k=>`#${k}`).join(' '));parts.push('\n## SEO\nTitle: '+(r.seo?.title||'')+'\n\nDescription: '+(r.seo?.description||'')+'\n\nTags: '+(r.seo?.tags||[]).join(', '));cachedMD=parts.join('\n');}
$('#btn-copy-md').addEventListener('click', async ()=>{if(!cachedMD)buildMarkdown();await navigator.clipboard.writeText(cachedMD);alert('Markdown copied.');});

// Utility functions
function toSec(ts){const p=ts.split(':').map(Number);if(p.length===3)return p[0]*3600+p[1]*60+p[2];if(p.length===2)return p[0]*60+p[1];return Number(p[0]||0);}
function esc(str){return (str||'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));}