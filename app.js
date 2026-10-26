'use strict';
const API='https://rfcozgyvupvachhhblzn.supabase.co/functions/v1/transfer-booking';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('ko-KR')+'원';
const dateKey=v=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const fullDate=v=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date(v));
const time=v=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v));
const statusText={pending:'확정 대기',review:'확정 대기',cancel_requested:'취소 신청',confirmed:'예약 확정',expired:'기한 경과',cancelled:'취소 완료'};
let data,selectedDay='',selectedSlot='',month='',timer,refreshTimer,refreshing=false,serverOffset=0;
let receiptToken=sessionStorage.getItem('ttb-receipt')||'';
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),4200);}
async function api(action,payload={}){
 if(!['public','book','lookup','status','cancel'].includes(action))throw new Error('지원하지 않는 요청입니다.');
 const r=await fetch(API,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(20000)});
 let d;try{d=await r.json();}catch{throw new Error('서버 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');}
 if(!r.ok||d.error){const e=new Error(d.error||'요청 처리에 실패했습니다.');e.status=r.status;throw e;}if(d.server_time)serverOffset=Date.parse(d.server_time)-Date.now();return d;
}
function bind(selector,event,fn,root=document){$(selector,root)?.addEventListener(event,fn);}
function openModal(html){$('#modal-body').innerHTML='<div class="dialog-content">'+html+'</div>';if(!$('#modal').open)$('#modal').showModal();bind('.close','click',()=>$('#modal').close(),$('#modal'));}
function modalHead(title){return `<div class="dialog-head"><h2>${title}</h2><button class="close" type="button" aria-label="닫기">×</button></div>`;}
function field(label,name,value='',type='text',options=''){return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${options}></div>`;}
function textarea(label,name,value='',options=''){return `<div class="field"><label for="${name}">${label}</label><textarea id="${name}" name="${name}" ${options}>${esc(value)}</textarea></div>`;}
function formPayload(form){return Object.fromEntries(new FormData(form));}
async function submitForm(form,fn){const b=$('[type=submit]',form);b.disabled=true;const err=$('.form-error',form);if(err)err.textContent='';try{await fn(formPayload(form));}catch(e){if(err)err.textContent=e.message;else toast(e.message);}finally{if(b.isConnected)b.disabled=false;}}
function current(){return data;}
async function loadPublic(){data=await api('public');$('#brand-title').textContent='임대 매물 방문 신청';document.title='임대 매물 방문 신청';}
function isVisitorHome(){return !location.hash||location.hash==='#'||location.hash==='#main';}
function syncSelection(){
 const slots=data.slots;
 if(selectedSlot&&!slots.some(x=>x.id===selectedSlot&&x.available))selectedSlot='';
 if(selectedDay&&!slots.some(x=>dateKey(x.starts_at)===selectedDay))selectedDay='';
 if(!selectedDay){const first=slots.find(x=>x.available)||slots[0];if(first){selectedDay=dateKey(first.starts_at);month=selectedDay.slice(0,7);}}
 if(!month)month=dateKey(new Date()).slice(0,7);
}
async function refreshPublic(force=false){
 if(refreshing||!isVisitorHome()||(!force&&($('#modal').open||document.hidden)))return;
 refreshing=true;const old=JSON.stringify(data&&{settings:data.settings,slots:data.slots});
 try{await loadPublic();if(isVisitorHome()&&old!==JSON.stringify({settings:data.settings,slots:data.slots})){syncSelection();renderHome();}}
 catch(e){if(force)toast(e.message);}finally{refreshing=false;}
}
async function route(){
 clearInterval(timer);clearInterval(refreshTimer);$('#modal').close();$('#main').innerHTML='<div class="loading">불러오는 중…</div>';
 try{
   if(location.hash==='#receipt'&&receiptToken)await renderReceipt();
   else{await loadPublic();syncSelection();renderHome();refreshTimer=setInterval(()=>refreshPublic(),10000);}
 }catch(e){$('#main').innerHTML=`<section class="receipt"><p class="small">${esc(e.message)}</p><button id="retry" class="primary">다시 시도</button></section>`;bind('#retry','click',route);}
}
function renderHome(){const s=data.settings;syncSelection();
 $('#main').innerHTML=`<section id="booking" class="visitor-booking"><div class="visitor-heading"><div><h1>임대 매물 방문 신청</h1><p class="visitor-address">방문희망 시간을 선택해주세요.</p></div><div><span id="booking-state" class="small">${s.enabled?'':'예약 준비 중'}</span><button id="refresh-availability" class="text-btn" aria-label="일정 새로고침">↻</button></div></div><div class="booking-card"><div class="calendar"><div class="month-head"><h3 id="month-title"></h3><div class="arrows"><button class="icon-btn" id="prev-month" aria-label="이전 달">‹</button><button class="icon-btn" id="next-month" aria-label="다음 달">›</button></div></div><div class="week">${['일','월','화','수','목','금','토'].map(x=>`<span>${x}</span>`).join('')}</div><div class="days" id="calendar-days"></div></div><div class="times-panel" id="times-panel"></div></div><div class="visitor-footnote">${s.amount?'예약금 '+money(s.amount)+' · 신청 당일 내 입금':'한국 시간 기준'}</div></section>`;
 bind('#prev-month','click',()=>changeMonth(-1));bind('#next-month','click',()=>changeMonth(1));bind('#refresh-availability','click',()=>refreshPublic(true));drawCalendar();
}
function changeMonth(delta){const [y,m]=month.split('-').map(Number);month=dateKey(new Date(Date.UTC(y,m-1+delta,1))).slice(0,7);drawCalendar();}
function drawCalendar(){const c=current();const [y,m]=month.split('-').map(Number);$('#month-title').textContent=`${y}년 ${m}월`;let html='';for(let i=0;i<new Date(Date.UTC(y,m-1,1)).getUTCDay();i++)html+='<span></span>';for(let d=1;d<=new Date(Date.UTC(y,m,0)).getUTCDate();d++){const key=`${month}-${String(d).padStart(2,'0')}`,available=c.slots.some(x=>dateKey(x.starts_at)===key&&x.available);html+=`<button class="day ${available?'open':''} ${selectedDay===key?'selected':''}" data-day="${key}" ${!available?'disabled':''} aria-label="${m}월 ${d}일${available?' 예약 가능':' 예약 불가'}" aria-pressed="${selectedDay===key}">${d}</button>`;}$('#calendar-days').innerHTML=html;
 const nowMonth=dateKey(new Date()).slice(0,7);$('#prev-month').disabled=month<=nowMonth;$('#next-month').disabled=month>=dateKey(new Date(Date.now()+365*86400000)).slice(0,7);
 $$('[data-day]').forEach(b=>b.addEventListener('click',()=>{selectedDay=b.dataset.day;selectedSlot='';drawCalendar();}));drawTimes();}
function drawTimes(){const slots=data.slots.filter(x=>dateKey(x.starts_at)===selectedDay);
 $('#times-panel').innerHTML=selectedDay&&slots.length?`<h3>${fullDate(selectedDay+'T12:00:00+09:00')}</h3><div class="time-grid">${slots.map(x=>`<button class="time ${x.id===selectedSlot?'selected':''}" data-slot="${x.id}" ${!x.available?'disabled':''} aria-pressed="${x.id===selectedSlot}" aria-label="${time(x.starts_at)} ${x.available?'신청 가능':'신청 불가'}">${time(x.starts_at)}<small>${x.available?'신청 가능':'신청 불가'}</small></button>`).join('')}</div><button class="primary" id="continue" ${!selectedSlot?'disabled':''}>예약 신청</button>`:`<div class="empty"><strong>${data.slots.length?'날짜를 선택하세요':'등록된 일정이 없습니다.'}</strong></div>`;
 $$('[data-slot]').forEach(b=>b.addEventListener('click',()=>{selectedSlot=b.dataset.slot;drawTimes();}));bind('#continue','click',showSharedNotice);
}
function showSharedNotice(){
 openModal(modalHead('방문 안내')+`<p class="shared-notice">다른 팀과 같이 볼 수도 있습니다.</p><p class="small">노쇼 방지를 위한 예약금 ${money(data.settings.amount)}이 있습니다.<br>신청 당일 내 입금해 주세요.</p><button id="shared-continue" class="primary wide">확인하고 신청</button>`);
 bind('#shared-continue','click',showBookingForm);
}
function showBookingForm(){const s=data.settings,slot=data.slots.find(x=>x.id===selectedSlot);if(!slot)return;
 openModal(modalHead('예약 신청')+`<div class="notice">${fullDate(slot.starts_at)} · ${time(slot.starts_at)}</div><form id="booking-form"><div class="form-grid">${field('이름','name','','text','required minlength="2" maxlength="50" autocomplete="name"')}${field('연락처','phone','','tel','required autocomplete="tel" minlength="9" maxlength="20" placeholder="010-1234-5678"')}</div>${field('입금자명','depositor','','text','required minlength="2" maxlength="50"')}<details class="consent-details"><summary>개인정보·취소 및 환불 안내</summary><div class="consent-info">수집 항목: 이름, 연락처, 입금자명<br>목적: 방문 예약 관리·입금 확인·일정 연락<br>보유 기간: 양도 시 또는 방문 취소 처리 완료 시 개인정보를 파기합니다.<br>처리 담당: 사이트 운영자 · ${esc(s.contact)}<br>동의를 거부할 수 있으며, 거부 시 온라인 예약이 어렵습니다.<br><br>예약금 ${money(s.amount)} · 신청 당일 내 입금해 주세요. 주인이 입금을 확인하면 예약이 확정됩니다.<br>${esc(s.refund_policy)}</div></details><label class="check-label"><input type="checkbox" name="consent" required> 개인정보 수집·이용에 동의합니다.</label><label class="check-label"><input type="checkbox" name="terms" required> 예약금·취소 및 환불 안내를 확인했습니다.</label><div class="form-error" role="alert">${s.enabled?'':'예약 접수 준비 중입니다.'}</div><button class="primary wide" type="submit" ${!s.enabled?'disabled':''}>신청하고 계좌 보기</button></form>`);
 bind('#name','input',e=>{const dep=$('#depositor');if(!dep.dataset.edited)dep.value=e.target.value;});bind('#depositor','input',e=>{e.target.dataset.edited='true';});
 bind('#booking-form','submit',e=>{e.preventDefault();submitForm(e.target,async p=>{const r=await api('book',{...p,slot_id:selectedSlot,consent:e.target.elements.consent.checked,terms:e.target.elements.terms.checked,shared_viewing:true});receiptToken=r.token;sessionStorage.setItem('ttb-receipt',receiptToken);if(location.hash==='#receipt')await route();else location.hash='receipt';});});
}
function showLookup(){
 openModal(modalHead('내 예약 확인')+`<form id="lookup-form">${field('신청자 이름','name','','text','required minlength="2" maxlength="50" autocomplete="name"')}${field('확인 코드 · 전화번호 뒤 4자리','last4','','text','required minlength="4" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="예: 1234" autocomplete="off"')}<div class="form-error" role="alert"></div><button class="primary wide" type="submit">예약 확인</button></form>`);
 bind('#lookup-form','submit',e=>{e.preventDefault();submitForm(e.target,async p=>{const r=await api('lookup',p);if(r.matches){showLookupMatches(p,r.matches);return;}openReceipt(r.token);});});
}
function openReceipt(token){receiptToken=token;sessionStorage.setItem('ttb-receipt',token);if(location.hash==='#receipt')route();else location.hash='receipt';}
function showLookupMatches(credentials,matches){
 openModal(modalHead('방문 일정 선택')+matches.map(m=>`<button class="secondary lookup-match wide" data-booking-id="${m.id}">${fullDate(m.starts_at)} ${time(m.starts_at)} · ${statusText[m.status]}</button>`).join('')+'<div class="form-error" role="alert"></div>');
 $$('[data-booking-id]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{const r=await api('lookup',{...credentials,id:button.dataset.bookingId});openReceipt(r.token);}catch(e){$('.form-error',$('#modal')).textContent=e.message;button.disabled=false;}}));
}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('복사했습니다.');}catch{toast('복사 기능을 사용할 수 없습니다. 화면의 내용을 직접 복사해 주세요.');}}
async function renderReceipt(){
 const r=await api('status',{token:receiptToken}),b=r.booking,p=b.payment;
 const titles={pending:'예약 확정을 기다리고 있어요.',review:'예약 확정을 기다리고 있어요.',confirmed:'방문 예약이 확정되었어요.',cancel_requested:'취소 신청이 접수되었어요.',expired:'입금 기한이 지났어요.',cancelled:'취소 처리가 완료되었어요.'};
 const pending=['pending','review'].includes(b.status),canCancel=['pending','review','confirmed','expired'].includes(b.status)&&!b.pii_purged;
 $('#main').innerHTML=`<section class="receipt"><div class="big-check">${b.status==='confirmed'?'✓':'↗'}</div><h1>${titles[b.status]}</h1><span class="pill ${b.status}">${statusText[b.status]}</span><p class="small">${pending?'입금 후 주인이 확인하면 예약이 확정됩니다.':b.status==='cancel_requested'?'주인이 환불계좌를 확인한 후 취소·환불을 처리합니다.':b.status==='expired'?'이미 입금했다면 주인에게 문의해 주세요.':''}</p><div class="receipt-row"><span>방문 일시</span><b>${fullDate(b.starts_at)}<br>${time(b.starts_at)} – ${time(b.ends_at)}</b></div>${!b.pii_purged?`<div class="receipt-row"><span>신청자 / 입금자</span><b>${esc(b.name)} / ${esc(b.depositor)}</b></div>`:''}<div class="receipt-row"><span>방문 장소</span><b>${esc(p.location||'종로8길 15 4층입니다')}</b></div>${pending?`<div class="account-box"><span class="small">예약금</span><strong class="account-number">${money(p.amount)}</strong><div>${esc(p.bank)} · ${esc(p.account)}</div><p class="small">예금주 ${esc(p.holder)}</p><button id="copy-account" class="secondary">계좌번호 복사</button></div><div class="notice warning"><b id="countdown"></b><br>입금 기한: ${fullDate(Date.parse(b.expires_at)-1)} 23:59까지</div>`:''}${!b.pii_purged?`<div class="notice space-top"><b>내 예약 확인</b>에서 이름과 전화번호 뒤 4자리 <b>${esc(b.confirmation_code)}</b>로 다시 확인하세요.</div>`:'<div class="notice space-top">취소 처리 완료로 개인정보가 파기되었습니다.</div>'}<details class="consent-details"><summary>취소·환불 안내 및 문의</summary><div class="consent-info">${esc(p.refund_policy)}<br>${esc(p.contact)}</div></details><div class="actions"><button id="refresh-receipt" class="secondary">상태 새로고침</button><a class="secondary" href="#">홈으로</a>${canCancel?'<button id="cancel-booking" class="secondary danger">취소 신청</button>':''}</div></section>`;
 bind('#copy-account','click',()=>copy(p.account));bind('#refresh-receipt','click',()=>route());bind('#cancel-booking','click',()=>showCancellationForm(b));
 if(b.pii_purged)sessionStorage.removeItem('ttb-receipt');
 clearInterval(refreshTimer);if(!b.pii_purged)refreshTimer=setInterval(async()=>{if(document.hidden||$('#modal').open)return;try{const latest=await api('status',{token:receiptToken});if(latest.booking.status!==b.status)route();}catch{clearInterval(refreshTimer);}},10000);
 clearInterval(timer);if(pending){const tick=()=>{const left=Math.max(0,Math.floor((Date.parse(b.expires_at)-Date.now()-serverOffset)/1000));const el=$('#countdown');if(el)el.textContent=left?`남은 입금 시간 ${Math.floor(left/3600)}시간 ${Math.floor(left%3600/60)}분`:'입금 기한 경과 · 주인 확인 대기';if(!left)clearInterval(timer);};tick();timer=setInterval(tick,1000);}
}
function showCancellationForm(booking){
 openModal(modalHead('취소 신청')+`<p class="small">${fullDate(booking.starts_at)} ${time(booking.starts_at)}</p><form id="cancel-form">${field('환불받을 은행','refund_bank','','text','required minlength="2" maxlength="60" placeholder="예: 국민은행"')}${field('환불받을 계좌번호','refund_account','','text','required minlength="6" maxlength="40" inputmode="numeric" placeholder="계좌번호를 입력하세요"')}${field('예금주','refund_holder',booking.name,'text','required minlength="2" maxlength="50"')}<div class="consent-info">환불은행·계좌번호·예금주는 취소 및 환불 처리에 사용하며, 처리 완료 시 파기합니다.</div><label class="check-label"><input type="checkbox" name="refund_consent" required> 환불계좌 수집·이용에 동의합니다.</label><div class="form-error" role="alert"></div><button type="submit" class="primary wide">취소 신청 보내기</button></form>`);
 bind('#cancel-form','submit',event=>{event.preventDefault();submitForm(event.target,async payload=>{await api('cancel',{...payload,token:receiptToken,refund_consent:event.target.elements.refund_consent.checked});await route();});});
}
bind('#lookup-btn','click',showLookup);window.addEventListener('hashchange',route);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPublic();});window.addEventListener('focus',()=>refreshPublic());route();
