import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {BrowserScoreStore,defaultNotebook,STORE_KEY,validateNotebook} from '../src/store';
import {gradeProject,pendingCount,needsRegrade,recalculate} from '../src/grader';
import {demoProject} from '../src/demo';
import {sheetRows} from '../src/export';
import type {Notebook} from '../src/types';
let legacy:Map<string,string>;
beforeEach(()=>{legacy=new Map();vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('localStorage',{getItem:(k:string)=>legacy.get(k)??null,setItem:(k:string,v:string)=>legacy.set(k,v)});});
afterEach(()=>vi.unstubAllGlobals());
function legacyData(){const n=defaultNotebook(),grade=gradeProject(demoProject());delete grade.engineVersion;n.classes[7]={12:{name:'기존학생',performance:15,base:10,reasons:'Perfect',submission:{key:'old',fileName:'20712_기존학생.ent',student:{id:'20712',grade:2,classNo:7,number:12,name:'기존학생'},grade,pseudocode:'보존할 학생 구조',received:'2026-10-20'}}};return n;}
it('이전 localStorage 원본 보존과 IndexedDB 이전, 재채점 경고',async()=>{
 const original=JSON.stringify(legacyData());legacy.set(STORE_KEY,original);const store=new BrowserScoreStore();
 const n=(await store.load())!;expect(n.classes[7][12].name).toBe('기존학생');expect(n.classes[7][12].submission!.pseudocode).toBe('보존할 학생 구조');expect(needsRegrade(n.classes[7][12].submission!.grade)).toBe(true);expect(n.classes[7][12].reasons).not.toBe('Perfect');expect(legacy.get(STORE_KEY)).toBe(original);
 n.classes[7][12].name='변경학생';await store.save(n);expect((await new BrowserScoreStore().load())!.classes[7][12].name).toBe('변경학생');expect(legacy.get(STORE_KEY)).toBe(original);
});
it('이전 버전 점수는 확인 버튼으로 확정 처리하지 않음',()=>{const n=validateNotebook(legacyData()),g=n.classes[7][12].submission!.grade;g.acknowledged=true;expect(pendingCount(recalculate(g))).toBeGreaterThan(0);expect(sheetRows(n,7)[12][6]).toContain('재채점');});
it('이전 중 쓰기 실패 시 원본 그대로 유지하고 다시 시도 가능',async()=>{
 const original=JSON.stringify(legacyData());legacy.set(STORE_KEY,original);const store=new BrowserScoreStore();vi.spyOn(store,'save').mockRejectedValue(new DOMException('quota','QuotaExceededError'));
 await expect(store.load()).rejects.toThrow('quota');expect(legacy.get(STORE_KEY)).toBe(original);expect((await new BrowserScoreStore().load())!.classes[7][12].name).toBe('기존학생');
});
it('손상된 이전 저장값을 덮어쓰지 않고 원본 내보내기 가능',async()=>{
 legacy.set(STORE_KEY,'{bad');const store=new BrowserScoreStore();await expect(store.load()).rejects.toThrow();expect(await store.raw()).toBe('{bad');expect(legacy.get(STORE_KEY)).toBe('{bad');
});
it('손상된 IndexedDB를 예전 localStorage로 조용히 대체하지 않음',async()=>{
 legacy.set(STORE_KEY,JSON.stringify(defaultNotebook()));const store=new BrowserScoreStore();await store.save({version:99} as unknown as Notebook);await expect(store.load()).rejects.toThrow('백업 형식');expect(await store.raw()).toBe('{"version":99}');
});
it('스크립트를 포함한 300명, 5MB 초과 데이터 저장·읽기·백업 검증',async()=>{
 const n=defaultNotebook();n.settings.rows=50;
 for(let c=1;c<=6;c++)for(let num=1;num<=50;num++){
  const id=`2${String(c).padStart(2,'0')}${String(num).padStart(2,'0')}`,grade=gradeProject(demoProject());
  (n.classes[c]??={})[num]={name:'용량검증',performance:15,base:10,reasons:'Perfect',submission:{key:id,fileName:`${id}_용량검증.ent`,student:{id,grade:2,classNo:c,number:num,name:'용량검증'},grade,pseudocode:'x'.repeat(24000),received:'2026-10-20'}};
 }
 expect(JSON.stringify(n).length).toBeGreaterThan(5*1024*1024);const store=new BrowserScoreStore();await store.save(n);
 const loaded=(await new BrowserScoreStore().load())!;expect(Object.values(loaded.classes).reduce((total,rows)=>total+Object.keys(rows).length,0)).toBe(300);expect(loaded.classes[6][50].submission!.pseudocode).toHaveLength(24000);
 const restored=validateNotebook(JSON.parse((await store.raw())!));expect(restored.classes[6][50].performance).toBe(15);
});

it('IndexedDB 접속 차단 시에도 기존 localStorage 원본 내려받기 가능',async()=>{
 legacy.set(STORE_KEY,'원본');vi.stubGlobal('indexedDB',{open:()=>{throw new Error('blocked');}});const store=new BrowserScoreStore();await expect(store.load()).rejects.toThrow();expect(await store.raw()).toBe('원본');
});
