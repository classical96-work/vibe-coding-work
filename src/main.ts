import './style.css';
import AnalysisWorker from './analysis.worker?worker&inline';
import { createIcons, BookOpenCheck, UploadCloud, ShieldCheck, LayoutGrid, TableProperties, ClipboardCheck, Download, ChevronDown, ArrowUpRight, X, FileArchive, FolderOpen, Info, SlidersHorizontal, Check, TriangleAlert, ArrowRight, RotateCcw, DatabaseBackup, CircleHelp, CheckCheck, Menu, LockKeyhole, Search, CloudOff, FileSpreadsheet, ListChecks, ChevronRight, Sparkles, CircleCheck, LoaderCircle, FileUp } from 'lucide';
import { demoProject } from './demo';
import { gradeProject, numerals, pendingCount, recalculate, needsRegrade } from './grader';
import { MAX_FILE_BYTES, parseStudent, pseudocode } from './parser';
import { BrowserScoreStore, defaultNotebook, validateNotebook } from './store';
import { download, exportScores } from './export';
import type { Grade, Notebook, ScoreRow, Submission } from './types';
const icons = {BookOpenCheck,UploadCloud,ShieldCheck,LayoutGrid,TableProperties,ClipboardCheck,Download,ChevronDown,ArrowUpRight,X,FileArchive,FolderOpen,Info,SlidersHorizontal,Check,TriangleAlert,ArrowRight,RotateCcw,DatabaseBackup,CircleHelp,CheckCheck,Menu,LockKeyhole,Search,CloudOff,FileSpreadsheet,ListChecks,ChevronRight,Sparkles,CircleCheck,LoaderCircle,FileUp};
const icon = (name: string, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const h = (v: unknown) => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const app = document.querySelector<HTMLDivElement>('#app')!;
const store = new BrowserScoreStore();
let notebook: Notebook = defaultNotebook(), storageBlocked = false, saveError = '', saveTime = '';
let view: 'grading'|'book'|'reviews'|'help' = 'grading';
let activeClass = 1, recordMode = false, query = '', busy = false, progress = '', menuOpen = false;
let results: Submission[] = [];
let errors: {name:string;message:string}[] = [];
let modal: {type:'detail'|'student'|'roster'|'settings'|'export';key?:string} | undefined;
let previousFocus: HTMLElement | null = null;
let pendingSaves = 0;
let saveQueue: Promise<void> = Promise.resolve();
function saveStatus() {
  return `${icon(saveError?'triangle-alert':pendingSaves?'loader-circle':'cloud-off')} ${saveError?'저장 실패 · 백업이 필요해요':pendingSaves?'브라우저 저장 중…':saveTime?`이 브라우저에 저장됨 · ${saveTime}`:'서버 전송 없이, 이 브라우저에서만'}`;
}
function refreshPersistenceUI() {
  const status=document.querySelector('#save-status'); if(status)status.innerHTML=saveStatus();
  const feedback=document.querySelector('#save-feedback'); if(feedback)feedback.innerHTML=saveError?`<div class="banner error" role="alert">${icon('triangle-alert')}<span>${h(saveError)}</span></div>`:'';
  createIcons({icons,attrs:{'stroke-width':1.8}});
}
function persist(change = true): Promise<void> {
  if (change) notebook.revision++;
  const snapshot=structuredClone(notebook); pendingSaves++;
  saveQueue=saveQueue.then(async()=>{
    try {
      if(storageBlocked)throw new Error('기존 데이터 보호 중');
      await store.save(snapshot); saveError=''; saveTime=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    } catch { saveError=storageBlocked?saveError:'브라우저 저장에 실패했습니다. 저장 공간·비공개 모드 설정을 확인하고 지금 JSON 백업을 내려받아 주세요.'; }
    finally { pendingSaves--;refreshPersistenceUI(); }
  });
  return saveQueue;
}
function rowAt(c: number,n: number): ScoreRow { return notebook.classes[c]?.[n] ?? {name:''}; }
function setRow(c: number,n: number,r: ScoreRow) { notebook.classes[c] ??= {}; notebook.classes[c][n]=r; }
function allSaved(): Submission[] { return Object.values(notebook.classes).flatMap(rs=>Object.values(rs).flatMap(r=>r.submission ? [r.submission] : [])); }
function allSubmissions(): Submission[] { return [...results,...allSaved().filter(s=>!results.some(r=>r.key===s.key))]; }
function selected(): Submission | undefined { return allSubmissions().find(s=>s.key===modal?.key); }
function recorded(s: Submission): boolean { return !!s.student && rowAt(s.student.classNo,s.student.number).submission?.key===s.key; }
function displayName(s: Submission): string { return (s.student && s.student.grade===notebook.settings.gradeLevel ? rowAt(s.student.classNo,s.student.number).name : '') || s.student?.name || '이름 미입력'; }
function recordSubmission(s: Submission, force = false): boolean {
  if (!s.student) { if(force) openModal('student',s.key); return false; }
  if (s.demo) { toast('체험 결과는 성적표에 기록하지 않습니다. 실제 파일을 선택해 주세요.'); return false; }
  if(s.student.grade!==notebook.settings.gradeLevel){ if(force)toast(`현재 성적표는 ${notebook.settings.gradeLevel}학년입니다. 설정의 학년을 확인해 주세요.`); return false; }
  if(s.student.number>notebook.settings.rows){ if(force)toast('설정에서 반별 번호 수를 늘린 뒤 기록해 주세요.'); return false; }
  const old = rowAt(s.student.classNo,s.student.number);
  setRow(s.student.classNo,s.student.number,{name:old.name||s.student.name,performance:s.grade.performance,base:s.grade.base,reasons:s.grade.reasons,submission:structuredClone(s)});
  return true;
}
function updateSubmission(s: Submission,previousGrade?: Grade) {
  if(recorded(s)){
    const r=rowAt(s.student!.classNo,s.student!.number);
    if(previousGrade && (r.performance!==previousGrade.performance || r.base!==previousGrade.base || r.reasons!==previousGrade.reasons) && !confirm('성적표에 수동 수정한 점수나 사유가 있습니다. 이번 판정으로 다시 계산해 덮어쓸까요?')) return false;
    recordSubmission(s);persist();
  }
  const i=results.findIndex(r=>r.key===s.key);if(i>=0)results[i]=s;
  return true;
}
function toast(message: string) {
  document.querySelector('.toast')?.remove();
  const el=document.createElement('div');el.className='toast';el.role='status';el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),4500);
}
function openModal(type: NonNullable<typeof modal>['type'],key?:string){previousFocus=document.activeElement as HTMLElement;modal={type,key};renderModal();}
function closeModal(){modal=undefined;document.querySelector('#modal-root')!.innerHTML='';previousFocus?.focus();}
const nav = (id: typeof view,name:string,ico:string,badge?:number) => `<button class="nav-item ${view===id?'active':''}" data-action="nav" data-view="${id}" ${view===id?'aria-current="page"':''}>${icon(ico)}<span>${name}</span>${badge ? `<b class="nav-count">${badge}</b>`:''}</button>`;
function render() {
  const modalScroll = document.querySelector('.modal-content')?.scrollTop;
  const saved=allSaved(), pending=allSubmissions().filter(s=>pendingCount(s.grade)>0).length;
  app.innerHTML=`
    <aside class="sidebar ${menuOpen?'mobile-open':''}">
      <a class="brand" href="#" data-action="home"><span class="brand-mark">${icon('book-open-check')}</span><span>채점노트<small>선생님을 위한 작은 조교</small></span></a>
      <div class="workspace-label">MY WORKSPACE <span>LOCAL</span></div>
      <nav aria-label="주 메뉴">${nav('grading','간편 채점','layout-grid')}${nav('book','반별 성적표','table-properties')}${nav('reviews','검토함','clipboard-check',pending)}</nav>
      <div class="sidebar-divider"></div><nav aria-label="도움말">${nav('help','사용 안내','circle-help')}</nav>
      <div class="sidebar-bottom"><div class="privacy-icon">${icon('shield-check')}</div><strong>학생의 작품은 여기에서만.</strong><p>모든 파일은 이 브라우저에서 분석돼요.<br>외부 서버로 전송하지 않습니다.</p><span class="privacy-pill"><span class="status-dot"></span> 로컬 처리 · 계정 연결 없음</span></div>
      <div class="sidebar-footer">ENTRY GRADING NOTE <span>v1.2</span></div>
    </aside>
    <div class="shell"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="메뉴 열기">${icon('menu')}</button><span>워크스페이스</span>${icon('chevron-right')}<strong>${({grading:'간편 채점',book:'반별 성적표',reviews:'검토함',help:'사용 안내'})[view]}</strong></div><div class="topbar-right"><span class="local-status">${icon('lock-keyhole')} 내 브라우저 전용</span><span class="avatar">T</span></div></header>
    <main>
      <div class="page-heading"><div><div class="eyebrow">${view==='grading'?'LESS PAPERWORK, MORE TEACHING':view==='book'?'YOUR CLASS, AT A GLANCE':view==='reviews'?'A TEACHER’S FINAL SAY':'A LITTLE HELP TO GET STARTED'}</div><h1>${({grading:'숫자맞추기, 채점은 가볍게.',book:'우리 반 성적표',reviews:'한 번 더 살펴볼 작품',help:'채점노트 사용 안내'})[view]}</h1><p>${({grading:'엔트리 파일을 놓아 주세요. 꼼꼼한 채점과 기록은 채점노트가 도와드릴게요.',book:'채점 결과를 모으고, 필요한 내용은 직접 수정하세요.',reviews:'모호한 판정은 선생님의 판단으로 완성해 주세요.',help:'파일 선택부터 성적표 백업까지, 차근차근 시작해 보세요.'})[view]}</p></div><button class="button secondary backup-button" data-action="backup">${icon('database-backup')} 백업 내보내기</button></div>
      <div id="save-feedback">${saveError?`<div class="banner error" role="alert">${icon('triangle-alert')}<span>${h(saveError)}</span></div>`:''}</div>
      ${allSaved().some(s=>needsRegrade(s.grade))?'<div class="banner warning" role="alert">이전 버전의 채점 결과가 있습니다. 기존 점수는 잠정 값입니다. 원본 학생 파일을 다시 선택해 재채점해 주세요.</div>':''}
      <div class="backup-reminder ${notebook.revision>notebook.backedUpRevision?'changed':''}">${icon(notebook.revision>notebook.backedUpRevision?'info':'shield-check')}<span>${notebook.revision>notebook.backedUpRevision?'<strong>백업하지 않은 변경이 있어요.</strong> 성적표를 안전하게 보관하려면 JSON 백업을 내려받아 주세요.':'성적표는 이 브라우저에 저장됩니다. 사이트 데이터를 지우면 사라지므로 정기적으로 백업해 주세요.'}</span><button class="text-button" data-action="restore">백업 불러오기 ${icon('arrow-up-right')}</button></div>
      ${view==='grading'?gradingView():view==='book'?bookView(saved):view==='reviews'?reviewView():helpView()}
      <footer class="main-footer"><span id="save-status" role="status">${saveStatus()}</span><span>조금 더 수업에 집중할 수 있도록.</span></footer>
    </main></div><input type="file" id="ent-files" accept=".ent" multiple hidden><input type="file" id="restore-file" accept=".json,application/json" hidden><div id="modal-root"></div>`;
  createIcons({icons,attrs:{'stroke-width':1.8}});
  document.querySelector<HTMLInputElement>('#ent-files')!.onchange=e=>{void processFiles((e.target as HTMLInputElement).files);};
  document.querySelector<HTMLInputElement>('#restore-file')!.onchange=e=>{void restoreBackup((e.target as HTMLInputElement).files?.[0]);};
  const drop=document.querySelector<HTMLElement>('.dropzone');
  if(drop){for(const name of ['dragenter','dragover'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');void processFiles(e.dataTransfer?.files);});}
  if(modal){renderModal();if(modalScroll!==undefined)requestAnimationFrame(()=>{const content=document.querySelector('.modal-content');if(content)content.scrollTop=modalScroll;});}
}
function classTabs() { return `<div class="class-tabs" role="group" aria-label="반 선택">${Array.from({length:9},(_,i)=>`<button class="class-tab ${activeClass===i+1?'selected':''}" data-action="class" data-class="${i+1}" aria-pressed="${activeClass===i+1}">${i+1}반${Object.values(notebook.classes[i+1]??{}).some(r=>r.performance!==undefined)?'<span class="tiny-dot"></span>':''}</button>`).join('')}</div>`; }
function stats(items: Submission[]) {
  const ready=items.filter(s=>pendingCount(s.grade)===0);
  const average=items.length?(items.reduce((n,s)=>n+s.grade.total,0)/items.length).toFixed(1):'—';
  const data=[['file-archive','선택한 파일',items.length,'개','이번 작업에서 분석한 작품',''],['circle-check','채점 완료',ready.length,'개','기준에 따라 판정한 작품','green'],['clipboard-check','검토 필요',items.length-ready.length,'개','선생님의 확인이 필요해요','amber'],['list-checks','평균 총점',average,'점',`수행 15점 + 기본 ${notebook.settings.base}점`,'']];
  return `<div class="stats-grid">${data.map(([ic,label,value,unit,desc,color])=>`<div class="stat-card"><div class="stat-label">${label}<span class="stat-icon ${color}">${icon(String(ic))}</span></div><div class="stat-value ${color}">${value}<span>${unit}</span></div><p>${desc}</p></div>`).join('')}</div>`;
}
function gradingView() {
  const filtered=results.filter(s=>(!s.student||s.student.classNo===activeClass) && (!query||[displayName(s),s.fileName,s.student?.id].join(' ').includes(query)));
  return `<section class="upload-section" aria-label="파일 채점"><div class="section-top"><div class="section-title"><span class="step-number">01</span><h2>학생 작품 가져오기</h2></div><span class="subtle">.ent 파일 · 최대 1,000개 · 파일당 25MB</span></div>
    <div class="dropzone ${busy?'is-busy':''}" tabindex="0" role="button" aria-label="엔트리 파일 선택" aria-disabled="${busy}" data-action="upload"><div class="drop-illustration">${icon(busy?'loader-circle':'upload-cloud',busy?'spin':'')}</div><h3>${busy?h(progress):'여기에 엔트리 파일을 놓아 주세요'}</h3><p>${busy?'학생 작품을 브라우저 안에서 분석하고 있어요.':'파일을 끌어다 놓거나 아래 버튼으로 선택할 수 있어요.'}</p><span class="button primary">${icon('folder-open')} 파일 선택하기</span><div class="drop-footnote">${icon('shield-check')} 파일은 서버로 전송되지 않아요</div></div>
    <div class="upload-options"><div class="mode-control"><span>채점 모드</span><div class="segmented"><button class="${!recordMode?'active':''}" data-action="mode" data-mode="only" aria-pressed="${!recordMode}" ${busy?'disabled':''}>채점만</button><button class="${recordMode?'active':''}" data-action="mode" data-mode="record" aria-pressed="${recordMode}" ${busy?'disabled':''}>채점 후 성적표에 기록</button></div></div><button class="settings-link" data-action="settings">${icon('sliders-horizontal')} 기본점수 <strong>${notebook.settings.base}점</strong></button></div>
    <div class="try-demo">${icon('sparkles')}<span>처음 사용하시나요? 예시 작품으로 먼저 둘러보세요.</span><button class="text-button" data-action="demo" ${busy?'disabled':''}>예시로 체험하기 ${icon('arrow-right')}</button></div>
    </section>
    ${errors.length?`<section class="banner error file-errors" role="alert"><div>${icon('triangle-alert')}<strong>분석하지 못한 파일 ${errors.length}개</strong></div><ul>${errors.map(e=>`<li><b>${h(e.name)}</b> — ${h(e.message)}</li>`).join('')}</ul></section>`:''}
    ${stats(results)}
    <section class="panel"><div class="panel-heading"><div><h2>채점 결과 <span class="count-badge">${results.length}</span></h2><p>${recordMode?'학번이 확인된 작품은 해당 반 성적표에 기록합니다.':'채점만 모드예요. ‘성적표에 기록’을 눌러야 결과가 저장됩니다.'}</p></div><div class="panel-actions">${results.length?`<button class="button ghost" data-action="clear-results">결과 비우기</button>`:''}<button class="button secondary small" data-action="nav" data-view="book">성적표 보기 ${icon('arrow-up-right')}</button></div></div>
    <div class="table-toolbar">${classTabs()}<label class="search-box">${icon('search')}<input id="result-search" aria-label="결과 검색" placeholder="이름, 학번, 파일명 검색" value="${h(query)}"></label></div>
    <div id="result-table">${resultTable(filtered)}</div><div class="table-footnote">${icon('info')} 행을 누르면 항목별 판정과 학생 작품의 블록 구조를 확인할 수 있어요.</div></section>`;
}
function resultTable(items: Submission[]) {
  return `<div class="table-scroll"><table class="results-table"><thead><tr><th class="number-col">번호</th><th>이름</th><th>과제</th><th>수행 <small>/ 15</small></th><th>총점</th><th class="reason-col">감점사유 / 상태</th><th><span class="sr-only">작업</span></th></tr></thead><tbody>${items.length?items.sort((a,b)=>(a.student?.number??999)-(b.student?.number??999)).map(s=>`<tr class="result-row ${s.grade.performance<15?'deducted':''}" data-action="detail" data-key="${h(s.key)}" tabindex="0" aria-label="${h(displayName(s))} 채점 상세"><td class="number-col">${s.student?s.student.number:'—'}</td><td><strong>${s.student?h(displayName(s)):'학번 확인 불가'}</strong><small class="cell-meta">${s.student?h(s.student.id):h(s.fileName)} ${s.demo?'· 체험':''}</small></td><td><span class="task-label">숫자맞추기</span></td><td><strong class="score">${s.grade.performance}</strong></td><td><strong>${s.grade.total}</strong><small class="score-max"> / ${15+s.grade.base}</small></td><td><div class="reason-text ${s.grade.reasons==='Perfect'?'perfect':''}">${s.grade.reasons==='Perfect'?icon('check-check'):''}${h(s.grade.reasons)}</div><div class="row-badges">${pendingCount(s.grade)?`<span class="badge amber">검토 필요 ${pendingCount(s.grade)}</span>`:''}${recorded(s)?'<span class="badge green">성적표 기록됨</span>':''}${s.student&&s.student.grade!==notebook.settings.gradeLevel?'<span class="badge amber">학년 확인 필요</span>':''}${!s.student?`<button class="text-button" data-action="identify" data-key="${h(s.key)}">학번 입력</button>`:''}</div></td><td><button class="icon-button" data-action="detail" data-key="${h(s.key)}" aria-label="상세 보기">${icon('chevron-right')}</button></td></tr>`).join(''):`<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">${icon('file-archive')}</span><h3>${results.length?'이 반에 표시할 결과가 없어요':'아직 채점한 작품이 없어요'}</h3><p>${results.length?'다른 반을 선택하거나 검색어를 확인해 주세요.':'학생 파일을 가져오면 이곳에 채점 결과가 차곡차곡 모입니다.'}</p>${!results.length?'<span class="empty-chips"><span>13개 채점 기준</span><span>규칙 기반 자동 채점</span><span>교사 최종 검토</span></span>':''}</div></td></tr>`}</tbody></table></div>`;
}
function bookView(saved: Submission[]) {
  const rows=notebook.classes[activeClass]??{}, graded=Object.values(rows).filter(r=>r.performance!==undefined);
  const avg=graded.length?(graded.reduce((n,r)=>n+r.performance!+(r.base??0),0)/graded.length).toFixed(1):'—';
  return `<div class="book-summary"><div><span class="class-icon">${icon('table-properties')}</span><div><h2>${notebook.settings.gradeLevel}학년 ${activeClass}반</h2><p>채점 <strong>${graded.length}명</strong> / 전체 ${notebook.settings.rows}명 <span class="dot-separator">·</span> 평균 총점 <strong>${avg}점</strong></p></div></div><div><button class="button secondary" data-action="roster">${icon('clipboard-check')} 명단 붙여넣기</button><button class="button primary" data-action="export">${icon('download')} 성적표 내려받기</button></div></div>
    <section class="panel"><div class="table-toolbar">${classTabs()}<button class="settings-link" data-action="settings">${icon('sliders-horizontal')} 학년·번호 설정</button></div><div class="book-instruction">${icon('info')} 이름·점수·감점사유 칸을 클릭해서 수정하세요. 총점은 수행점수와 기본점수를 더해 자동 계산합니다.</div><div class="table-scroll"><table class="gradebook"><thead><tr><th class="number-col">번호</th><th>이름</th><th>수행점수 <small>/ 15</small></th><th>기본점수</th><th>총점</th><th class="reason-col">감점사유</th><th>상세</th></tr></thead><tbody>${Array.from({length:notebook.settings.rows},(_,i)=>{const n=i+1,r=rows[n]??{name:''},graded=r.performance!==undefined;return `<tr class="${!graded?'ungraded':r.reasons==='Perfect'?'full-score':'deducted'}"><td class="number-col">${n}</td><td><input class="cell-input name" aria-label="${n}번 이름" data-cell="name" data-number="${n}" maxlength="100" value="${h(r.name)}" placeholder="이름 입력"></td><td><input class="cell-input numeric" type="number" step="0.5" min="0" max="15" aria-label="${n}번 수행점수" data-cell="performance" data-number="${n}" value="${r.performance??''}" placeholder="—"></td><td><input class="cell-input numeric" type="number" step="0.5" min="0" max="100" aria-label="${n}번 기본점수" data-cell="base" data-number="${n}" value="${r.base??''}" placeholder="—"></td><td><strong class="${graded?'':'muted'}">${graded?r.performance!+(r.base??0):'—'}</strong></td><td><textarea class="cell-input reason ${r.reasons==='Perfect'?'perfect':''}" aria-label="${n}번 감점사유" data-cell="reasons" data-number="${n}" rows="${Math.max(1,Math.min(5,r.reasons?.split('\n').length??1))}" maxlength="10000" placeholder="미채점">${h(r.reasons??'')}</textarea>${r.submission&&pendingCount(r.submission.grade)?`<span class="badge amber">검토 필요 ${pendingCount(r.submission.grade)}</span>`:''}</td><td>${r.submission?`<button class="icon-button" data-action="detail" data-key="${h(r.submission.key)}" aria-label="${n}번 채점 상세">${icon('chevron-right')}</button>`:'<span class="muted">—</span>'}</td></tr>`;}).join('')}</tbody></table></div><div class="table-footnote"><span class="legend-dot green"></span> 만점 <span class="legend-dot amber"></span> 감점 <span class="legend-dot gray"></span> 미채점 <span class="footnote-right">기록된 작품 ${saved.length}개 · 새 파일을 기록하면 같은 학번 결과를 갱신해요</span></div></section>`;
}
function reviewView(){
  const items=allSubmissions().filter(s=>pendingCount(s.grade)>0);
  return `<section class="panel"><div class="panel-heading"><div><h2>검토 대기 <span class="count-badge">${items.length}</span></h2><p>모호한 항목은 우선 감점하지 않았습니다. 현재 점수는 잠정 점수입니다.</p></div></div>${items.length?`<div class="review-list">${items.map(s=>`<button class="review-card" data-action="detail" data-key="${h(s.key)}"><span class="review-card-icon">${icon('clipboard-check')}</span><span><strong>${h(s.student?`${s.student.classNo}반 ${s.student.number}번 ${displayName(s)}`:s.fileName)}</strong><small>${h([...(needsRegrade(s.grade)?['이전 버전 · 원본 재채점 필요']:[]),...s.grade.criteria.filter(c=>c.review&&!c.decision).map(c=>c.label),...(!s.grade.acknowledged?s.grade.notices:[])].join(' · '))}</small></span><span class="badge amber">${pendingCount(s.grade)}건</span>${icon('chevron-right')}</button>`).join('')}</div>`:`<div class="empty-state"><span class="empty-icon green">${icon('check-check')}</span><h3>검토할 작품이 없어요</h3><p>추가 확인이 필요한 작품이 생기면 이곳에 모아 드릴게요.</p></div>`}</section>`;
}
function helpView(){return `<div class="help-grid"><section class="panel help-card"><h2>처음이라면, 이렇게 시작하세요</h2><ol class="help-steps"><li><b>01</b><div><strong>학생 파일을 선택하세요</strong><p>엔트리에서 저장한 .ent 파일을 여러 개 선택할 수 있어요. 파일명은 <code>20712_홍길동.ent</code>처럼 학번과 이름을 포함해 주세요.</p></div></li><li><b>02</b><div><strong>채점 결과를 확인하세요</strong><p>행을 누르면 13개 항목별 판정과 의사코드를 볼 수 있어요. ‘검토 필요’는 인정 또는 감점으로 결정해 주세요. 추가 블록 때문에 기존 감점이 사라지지는 않아요. 지원 범위 밖의 블록은 구조를 직접 확인해 주세요.</p></div></li><li><b>03</b><div><strong>성적표에 기록하고 백업하세요</strong><p>채점만 모드는 결과를 저장하지 않아요. 기록 모드 또는 상세 화면의 ‘성적표에 기록’을 사용하세요. JSON 백업은 다른 PC에서 불러올 수 있어요.</p></div></li></ol></section><section class="panel help-card"><span class="help-big-icon">${icon('shield-check')}</span><h2>저장 위치를 꼭 기억해 주세요</h2><p>학생 파일은 외부로 전송되지 않습니다. 성적표·명단·검토 결과는 이 PC의 이 브라우저와 현재 사이트 주소의 IndexedDB에 저장돼요. 이전 localStorage 기록은 원본을 보존하며 자동으로 옮깁니다.</p><p><strong>브라우저 사이트 데이터 삭제·비공개 모드 종료·사이트 주소 변경 시 데이터가 사라지거나 보이지 않을 수 있습니다.</strong> 주기적으로 JSON 백업을 내려받으세요. 엑셀 파일은 성적표 공유용이며 검토 기록 복원은 JSON 백업을 사용해 주세요.</p><button class="button secondary" data-action="backup">${icon('database-backup')} JSON 백업 내보내기</button></section><section class="panel help-card"><h2>채점 기준</h2><p>수행 15점에 기본점수(기본 10점)를 더합니다. 필수 변수명은 ‘정답’과 ‘정답횟수’이며 공백은 허용합니다. 변수명 문제는 한 번만 1점 감점해요.</p><p>정답은 1~10 난수를 저장해야 합니다. 다른 범위는 ③ 항목에서 1점 감점합니다. 크기 비교의 피연산자 순서, 마지막 정답 입력의 횟수 포함 여부, 정답·오답 분기의 종료도 확인합니다. 임의의 엔트리 프로그램 전체를 실행하는 도구는 아니므로 최종 성적 확정 전 교사 검토가 필요합니다.</p><p>성적표는 한 학년용입니다. 학년을 바꾸려면 먼저 백업하고 새 성적표를 시작하세요.</p></section><section class="panel help-card"><h2>데이터 관리</h2><p>JSON 백업은 학생 이름과 성적을 포함하므로 학교의 자료 관리 기준에 맞게 보관해 주세요.</p><div class="help-buttons"><button class="button secondary" data-action="restore">${icon('file-up')} 백업 불러오기</button><button class="button secondary" data-action="raw-backup">저장 원본 내려받기</button></div><button class="text-button danger" data-action="reset">새 성적표 시작하기</button></section></div>`;}
function renderModal(){
  const root=document.querySelector<HTMLElement>('#modal-root')!;
  if(!modal){root.innerHTML='';return;}
  const type=modal.type,s=selected();
  let title='',subtitle='',content='',wide=false;
  if(type==='detail'&&s){
    wide=true; title=s.student?`${s.student.classNo}반 ${s.student.number}번 · ${displayName(s)}`:'학번 확인이 필요한 작품';subtitle=s.fileName;
    const row=s.student?rowAt(s.student.classNo,s.student.number):undefined;
    const manual=recorded(s)&&(row?.performance!==s.grade.performance||row?.base!==s.grade.base||row?.reasons!==s.grade.reasons);
    content=`<div class="detail-score"><div><span>수행점수</span><strong>${s.grade.performance}<small> / 15</small></strong></div><span class="equation">+</span><div><span>기본점수</span><strong>${s.grade.base}</strong></div><span class="equation">=</span><div class="total"><span>${pendingCount(s.grade)?'잠정 총점':'총점'}</span><strong>${s.grade.total}<small>점</small></strong></div><div class="detail-record">${s.demo?'<span class="badge">예시 작품 · 저장 안 함</span>':recorded(s)?'<span class="badge green">성적표에 기록됨</span>':`<button class="button primary small" data-action="record" data-key="${h(s.key)}">${icon('table-properties')} 성적표에 기록</button>`}${!s.student?`<button class="text-button" data-action="identify" data-key="${h(s.key)}">학번·이름 입력하기</button>`:''}</div></div>
      ${needsRegrade(s.grade)?'<div class="banner warning">이전 버전의 결과입니다. 원본 학생 파일을 다시 채점해야 확정할 수 있습니다.</div>':''}
      ${manual?'<div class="banner info">성적표에 수동 수정한 값이 있습니다. 아래는 자동 채점 및 항목 판정 결과입니다.</div>':''}
      ${s.grade.naming.length?`<div class="banner warning"><strong>변수명 −1점</strong><span>${s.grade.naming.map(h).join('<br>')}<small>여러 이름 문제도 한 번만 감점합니다.</small></span></div>`:''}
      ${s.grade.notices.length?`<div class="structure-notice"><strong>${icon('triangle-alert')} 프로그램 구조 확인</strong><ul>${s.grade.notices.map(n=>`<li>${h(n)}</li>`).join('')}</ul><button class="button ${s.grade.acknowledged?'secondary':'primary'} small" data-action="acknowledge" data-key="${h(s.key)}">${icon('check')}${s.grade.acknowledged?'확인 완료 · 다시 검토':'구조를 확인했습니다'}</button></div>`:''}
      <div class="detail-columns"><section><h3>항목별 판정 <span>13개 기준</span></h3><div class="criteria-list">${s.grade.criteria.map(c=>{
        const deduction=c.decision==='accept'?0:c.decision==='deduct'?c.max:c.deduction;
        const pending=c.review&&!c.decision;
        return `<div class="criterion ${pending?'needs-review':deduction?'failed':'passed'}"><span class="criterion-number">${numerals[c.id-1]}</span><div class="criterion-body"><div class="criterion-heading"><strong>${h(c.label)}</strong><span class="criterion-points">${deduction?`−${deduction}점${pending?' · 검토 필요':''}`:pending?'검토 필요':'통과'}</span></div>${deduction?`<p class="deduction-reason">${h(c.reason)}</p>`:''}${pending?`<p>${h(c.review)} <b>불인정 시 총 −${c.max}점</b></p>`:''}<div class="decision-buttons"><button class="${c.decision==='accept'?'chosen':''}" data-action="decide" data-id="${c.id}" data-decision="accept" aria-pressed="${c.decision==='accept'}">인정</button><button class="${c.decision==='deduct'?'chosen deduct-choice':''}" data-action="decide" data-id="${c.id}" data-decision="deduct" aria-pressed="${c.decision==='deduct'}">감점 −${c.max}</button>${c.decision?`<button data-action="decide" data-id="${c.id}" data-decision="auto">자동 판정으로</button>`:''}</div></div></div>`;
      }).join('')}</div></section><section class="code-section"><div class="code-heading"><h3>블록 구조 살펴보기</h3><span>의사코드</span></div><p>모든 오브젝트의 스크립트입니다. 들여쓰기로 반복과 분기를 구분해요.</p><pre tabindex="0">${h(s.pseudocode)}</pre><div class="code-footnote">${icon('info')} 학생 코드를 실행하지 않고 블록의 구조를 분석합니다.</div></section></div>`;
  }else if(type==='student'&&s){
    title='학번·이름 확인';subtitle=s.fileName;
    content=`<p class="form-description">파일명에서 학번을 찾지 못했거나 수정이 필요한 경우 직접 입력해 주세요.</p><form id="student-form"><label class="field">학번 <input name="studentId" inputmode="numeric" pattern="[1-3]0[1-9](0[1-9]|[1-9][0-9])" maxlength="5" required placeholder="예: 20712" value="${h(s.student?.id??'')}" autofocus><small>학년 1자리 + 반 2자리 + 번호 2자리 (1~9반)</small></label><label class="field">이름 <input name="studentName" maxlength="100" placeholder="예: 홍길동" value="${h(s.student?.name??'')}"><small>성적표에 입력된 이름이 있으면 그 이름을 우선합니다.</small></label><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">취소</button><button class="button primary" type="submit">학번 적용하기</button></div></form>`;
  }else if(type==='roster'){
    title=`${notebook.settings.gradeLevel}학년 ${activeClass}반 명단 붙여넣기`;subtitle='엑셀에서 번호와 이름, 두 열을 복사해 주세요.';
    content=`<form id="roster-form"><label class="field">번호 · 이름 <textarea name="roster" rows="10" required placeholder="1&#9;김하늘&#10;2&#9;이서준&#10;3&#9;박지우" autofocus></textarea><small>탭 또는 공백으로 구분합니다. 기존 점수는 유지하고 입력한 번호의 이름을 갱신합니다.</small></label><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">취소</button><button class="button primary" type="submit">명단 적용하기</button></div></form>`;
  }else if(type==='settings'){
    title='채점·성적표 설정';subtitle='새로 채점하는 작품부터 적용됩니다.';
    content=`<form id="settings-form"><label class="field">기본점수 <input name="base" type="number" min="0" max="100" step="0.5" required value="${notebook.settings.base}"><small>수행점수 15점에 더하는 기본점수입니다. 기존 점수는 바뀌지 않아요.</small></label><div class="form-row"><label class="field">학년 <select name="gradeLevel">${[1,2,3].map(n=>`<option value="${n}" ${notebook.settings.gradeLevel===n?'selected':''}>${n}학년</option>`).join('')}</select></label><label class="field">반별 번호 수 <input name="rows" type="number" min="1" max="99" step="1" required value="${notebook.settings.rows}"></label></div><p class="form-description">성적표는 한 학년용입니다. 기록이 있는 상태에서 학년을 바꾸거나 사용 중인 번호를 숨길 수 없습니다.</p><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">취소</button><button class="button primary" type="submit">설정 저장</button></div></form>`;
  }else if(type==='export'){
    title='성적표 내려받기';subtitle='성적표에 기록된 데이터를 파일로 저장합니다.';
    content=`<form id="export-form"><label class="field">내보낼 범위 <select name="scope"><option value="current">현재 반 (${activeClass}반)</option><option value="all">전체 반 (1~9반)</option></select></label><label class="field">파일 형식 <select name="format"><option value="xlsx">엑셀 (.xlsx) — 반별 시트</option><option value="csv">CSV (.csv) — 엑셀 호환</option></select></label><p class="form-description">검토 대기 중인 점수는 잠정 점수입니다. 검토 기록까지 복원하려면 JSON 백업을 사용해 주세요.</p><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">취소</button><button class="button primary" type="submit">${icon('download')} 내려받기</button></div></form>`;
  }else {closeModal();return;}
  root.innerHTML=`<div class="modal-backdrop" data-action="backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><h2 id="modal-title">${h(title)}</h2><p>${h(subtitle)}</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x')}</button></header><div class="modal-content">${content}</div></section></div>`;
  createIcons({icons,attrs:{'stroke-width':1.8}});
  requestAnimationFrame(()=>root.querySelector<HTMLElement>('[autofocus], .modal-header button')?.focus());
}
async function analyze(file: File,base: number): Promise<{grade:Grade;pseudocode:string}> {
  if(file.size>MAX_FILE_BYTES)throw new Error('파일당 최대 25MB까지 분석할 수 있습니다.');
  const bytes=await file.arrayBuffer();
  return new Promise((resolve,reject)=>{
    const worker=new AnalysisWorker();
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('분석 시간이 초과되었습니다. 블록 구조가 너무 복잡할 수 있습니다.'));},30000);
    const finish=()=>{clearTimeout(timer);worker.terminate();};
    worker.onmessage=e=>{finish();e.data.error?reject(new Error(e.data.error)):resolve(e.data);};
    worker.onerror=()=>{finish();reject(new Error('파일 분석기를 실행하지 못했습니다. 웹서버로 페이지를 열었는지 확인해 주세요.'));};
    worker.postMessage({bytes,base},[bytes]);
  });
}
async function processFiles(files?: FileList|null){
  if(!files?.length||busy)return;
  const list=Array.from(files);if(list.length>1000){toast('한 번에 최대 1,000개 파일을 선택해 주세요.');return;}
  busy=true;errors=[];let completed=0,recordCount=0,firstClass:number|undefined;
  for(let i=0;i<list.length;i++){
    const file=list[i];progress=`${i+1} / ${list.length}개 분석 중`;render();
    try{
      if(!/\.ent$/i.test(file.name))throw new Error('.ent 파일만 채점할 수 있습니다.');
      const analysis=await analyze(file,notebook.settings.base);
      const student=parseStudent(file.name);
      const s:Submission={key:crypto.randomUUID(),fileName:file.name,student,...analysis,received:new Date().toISOString()};
      results=results.filter(old=>student?old.student?.id!==student.id:old.fileName!==file.name);
      results.push(s);completed++;
      if(student&&firstClass===undefined)firstClass=student.classNo;
      if(recordMode){
        if(recordSubmission(s)){recordCount++;if(recordCount%25===0)await persist();}
        else if(student)errors.push({name:file.name,message:student.grade!==notebook.settings.gradeLevel?`${student.grade}학년 파일입니다. 현재 ${notebook.settings.gradeLevel}학년 성적표에는 기록하지 않았습니다. 채점 결과는 확인할 수 있습니다.`:`${student.number}번은 현재 번호 범위 밖이라 기록하지 않았습니다. 설정에서 번호 수를 늘려 주세요.`});
      }
    }catch(e){errors.push({name:file.name,message:e instanceof Error?e.message:'알 수 없는 파일 오류'});}
  }
  if(recordCount)await persist();
  if(firstClass!==undefined)activeClass=firstClass;
  busy=false;view='grading';render();toast(`${completed}개 채점 완료${recordMode?` · ${recordCount}개 성적표 기록`:''}${errors.length?` · 확인할 파일 ${errors.length}개`:''}`);
}
async function restoreBackup(file?:File){
  if(!file)return;
  try{
    if(file.size>100*1024*1024)throw new Error('백업 파일은 100MB 이하로 선택해 주세요.');
    const data=validateNotebook(JSON.parse(await file.text()));
    if(!confirm('현재 성적표와 설정을 이 백업으로 덮어쓸까요? 현재 데이터는 먼저 백업하는 것을 권장합니다.'))return;
    notebook=data;notebook.backedUpRevision=notebook.revision;storageBlocked=false;results=[];errors=[];await persist(false);render();toast(saveError?'불러왔지만 브라우저 저장에 실패했습니다.':'백업을 불러왔습니다.');
  }catch(e){toast(e instanceof Error?e.message:'백업을 읽을 수 없습니다.');}
}
function backup(){
  const payload=structuredClone(notebook);payload.backedUpRevision=payload.revision;
  download(JSON.stringify(payload,null,2),`채점노트_백업_${new Date().toISOString().slice(0,10)}.json`,'application/json');
  notebook.backedUpRevision=notebook.revision;persist(false);render();toast('백업 다운로드를 요청했습니다. 파일이 저장됐는지 확인해 주세요.');
}
app.addEventListener('click',async e=>{
  const target=(e.target as HTMLElement).closest<HTMLElement>('[data-action]');if(!target)return;
  const action=target.dataset.action,key=target.dataset.key;
  if(target instanceof HTMLButtonElement&&target.disabled)return;
  if(action==='backdrop'&&e.target!==target)return;
  if(busy&&['settings','reset','restore','demo','record','roster','mode','identify'].includes(action??'')){toast('파일 분석이 끝난 뒤 변경해 주세요.');return;}
  if(action==='home'){e.preventDefault();view='grading';render();}
  if(action==='nav'){view=target.dataset.view as typeof view;menuOpen=false;query='';render();}
  if(action==='menu'){menuOpen=!menuOpen;render();}
  if(action==='upload'){if(!busy)document.querySelector<HTMLInputElement>('#ent-files')!.click();}
  if(action==='class'){activeClass=Number(target.dataset.class);render();}
  if(action==='mode'){recordMode=target.dataset.mode==='record';render();}
  if(action==='backup')backup();
  if(action==='restore')document.querySelector<HTMLInputElement>('#restore-file')!.click();
  if(action==='raw-backup'){try{download(await store.raw()??JSON.stringify(notebook),'채점노트_저장원본.json','application/json');}catch{toast('저장 원본을 읽지 못했습니다. 현재 데이터를 JSON 백업으로 내보내 주세요.');}}
  if(action==='reset'){
    if(!confirm('명단·성적·검토 기록을 모두 지우고 새 성적표를 시작할까요? 먼저 JSON 백업을 내려받으세요.'))return;
    notebook=defaultNotebook();results=[];errors=[];storageBlocked=false;saveError='';persist();render();toast('새 성적표를 시작했습니다.');
  }
  if(action==='demo'){
    const p=demoProject();const sample:Submission={key:'demo-perfect',fileName:'20712_예시학생.ent',student:{id:'20712',grade:2,classNo:7,number:12,name:'예시학생'},grade:gradeProject(p,notebook.settings.base),pseudocode:pseudocode(p),received:new Date().toISOString(),demo:true};
    const ambiguous=demoProject();ambiguous.objects[0].script[0][3].params![0]={type:'text',params:['내가 낸 문제를 맞춰봐']};
    results=[...results.filter(s=>!s.demo),sample,{...sample,key:'demo-review',fileName:'20713_검토예시.ent',student:{id:'20713',grade:2,classNo:7,number:13,name:'검토예시'},grade:gradeProject(ambiguous,notebook.settings.base),pseudocode:pseudocode(ambiguous)}];activeClass=7;render();toast('체험용 작품 2개를 채점했습니다. 성적표에는 기록하지 않습니다.');
  }
  if(action==='detail')openModal('detail',key);
  if(action==='identify')openModal('student',key);
  if(action==='settings')openModal('settings');
  if(action==='roster')openModal('roster');
  if(action==='export')openModal('export');
  if(action==='close-modal'||action==='backdrop')closeModal();
  if(action==='clear-results'){
    if(results.some(s=>!s.demo&&!recorded(s))&&!confirm('성적표에 기록하지 않은 채점 결과도 비울까요?'))return;
    results=[];errors=[];render();
  }
  if(action==='record'){
    const s=allSubmissions().find(s=>s.key===key);if(s&&recordSubmission(s,true)){persist();render();toast('성적표에 기록했습니다.');}
  }
  if(action==='decide'){
    const original=selected();if(!original)return;const s=structuredClone(original);
    const criterion=s.grade.criteria.find(c=>c.id===Number(target.dataset.id))!;
    criterion.decision=target.dataset.decision==='auto'?undefined:target.dataset.decision as 'accept'|'deduct';
    s.grade=recalculate(s.grade);if(updateSubmission(s,original.grade))render();
  }
  if(action==='acknowledge'){
    const original=selected();if(!original)return;const s=structuredClone(original);s.grade.acknowledged=!s.grade.acknowledged;s.grade=recalculate(s.grade);
    if(updateSubmission(s))render();
  }
});
app.addEventListener('input',e=>{
  const input=e.target as HTMLInputElement;
  if(input.id==='result-search'){
    query=input.value;
    const items=results.filter(s=>(!s.student||s.student.classNo===activeClass)&&[displayName(s),s.fileName,s.student?.id].join(' ').includes(query));
    document.querySelector('#result-table')!.innerHTML=resultTable(items);createIcons({icons,attrs:{'stroke-width':1.8}});
  }
});
app.addEventListener('change',e=>{
  const input=e.target as HTMLInputElement;const cell=input.dataset.cell as 'name'|'performance'|'base'|'reasons'|undefined;
  if(!cell)return;
  if(!input.checkValidity()){toast('점수 범위를 확인해 주세요. 수행은 0~15점, 기본은 0~100점입니다.');render();return;}
  const number=Number(input.dataset.number),row=structuredClone(rowAt(activeClass,number));
  if(cell==='name'||cell==='reasons')row[cell]=input.value;
  else {row[cell]=input.value===''?undefined:Number(input.value);if(cell==='performance'&&input.value!==''){if(row.base===undefined)row.base=notebook.settings.base;if(!row.reasons||row.reasons==='Perfect'||row.reasons==='교사 수동 점수 수정')row.reasons=row.performance===15?(row.submission&&pendingCount(row.submission.grade)?'검토 필요 (확정 전)':'Perfect'):'교사 수동 점수 수정';}}
  setRow(activeClass,number,row);persist();render();
});
app.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target as HTMLFormElement;const data=new FormData(form);
  if(form.id==='student-form'){
    const s=selected();if(!s)return;
    const id=String(data.get('studentId')),student=parseStudent(`${id}_${String(data.get('studentName'))}.ent`);
    if(!student||student.id!==id){toast('올바른 5자리 학번을 입력해 주세요.');return;}
    if(recorded(s)){toast('이미 기록한 학번은 성적표의 원본 기록을 보존하기 위해 변경할 수 없습니다. 파일을 다시 선택해 주세요.');return;}
    s.student=student;results=results.filter(r=>r.key===s.key||r.student?.id!==id);activeClass=student.classNo;
    if(recordMode&&!s.demo){if(recordSubmission(s,true))persist();}
    modal={type:'detail',key:s.key};render();
  }
  if(form.id==='roster-form'){
    const lines=String(data.get('roster')).trim().split(/\r?\n/).filter(l=>l.trim());const list:{number:number;name:string}[]=[];
    for(const line of lines){
      if(/^\s*번호\s+이름\s*$/.test(line))continue;
      const m=line.match(/^\s*(\d{1,2})[\t ,]+(.+?)\s*$/);
      if(!m||+m[1]<1||+m[1]>notebook.settings.rows||m[2].length>100){toast(`명단 형식 또는 번호 범위를 확인해 주세요: ${line.slice(0,35)}`);return;}
      list.push({number:+m[1],name:m[2]});
    }
    if(!list.length){toast('번호와 이름을 한 줄 이상 입력해 주세요.');return;}
    for(const r of list)setRow(activeClass,r.number,{...rowAt(activeClass,r.number),name:r.name});
    persist();closeModal();render();toast(`${list.length}개 이름을 적용했습니다.`);
  }
  if(form.id==='settings-form'){
    const base=Number(data.get('base')),rows=Number(data.get('rows')),gradeLevel=Number(data.get('gradeLevel'));
    if(!Number.isFinite(base)||base<0||base>100||!Number.isInteger(rows)||rows<1||rows>99||![1,2,3].includes(gradeLevel))return;
    const entries=Object.values(notebook.classes).flatMap(r=>Object.entries(r));
    if(gradeLevel!==notebook.settings.gradeLevel&&entries.some(([,r])=>r.name||r.performance!==undefined)){toast('기존 성적표를 백업하고 사용 안내에서 새 성적표를 시작한 뒤 학년을 바꿔 주세요.');return;}
    if(entries.some(([n,r])=>+n>rows&&(r.name||r.performance!==undefined||r.base!==undefined||r.reasons))){toast('줄이려는 번호에 데이터가 있어 번호 수를 줄일 수 없습니다.');return;}
    notebook.settings={base,rows,gradeLevel};persist();closeModal();render();toast('설정을 저장했습니다.');
  }
  if(form.id==='export-form'){
    const button=form.querySelector<HTMLButtonElement>('button[type="submit"]')!;button.disabled=true;button.textContent='파일 만드는 중…';
    try{await exportScores(notebook,data.get('format') as 'csv'|'xlsx',data.get('scope') as 'current'|'all',activeClass);closeModal();toast('성적표 다운로드를 요청했습니다.');}
    catch{toast('파일을 만들지 못했습니다. 다시 시도해 주세요.');button.disabled=false;button.textContent='다시 내려받기';}
  }
});
app.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&modal){closeModal();return;}
  if(e.key==='Tab'&&modal){
    const items=Array.from(document.querySelectorAll<HTMLElement>('.modal button:not([disabled]),.modal input,.modal select,.modal textarea,.modal [tabindex="0"]'));
    const first=items[0],last=items.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
  const target=e.target as HTMLElement;
  if((e.key==='Enter'||e.key===' ')&&target.matches('.dropzone,.result-row')){e.preventDefault();target.click();}
});
window.addEventListener('beforeunload',e=>{if(saveError||pendingSaves||results.some(s=>!s.demo&&!recorded(s))){e.preventDefault();e.returnValue='';}});
async function bootstrap() {
  app.innerHTML='<div class="loading-screen" role="status">채점노트 성적표를 불러오는 중…</div>';
  try { notebook=await store.load()??notebook; }
  catch { storageBlocked=true;saveError='기존 저장 데이터를 읽지 못했습니다. 원본은 보존했으며 새 변경은 저장되지 않습니다. 사용 안내에서 저장 원본을 내려받고 정상 백업을 불러와 주세요.'; }
  render();
}
void bootstrap();
