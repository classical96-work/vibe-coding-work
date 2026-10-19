import { describe,it,expect } from 'vitest';
import { b,compare,demoProject,say,text,v } from '../src/demo';
import { gradeProject,pendingCount,recalculate } from '../src/grader';
import { normalizeProject,parseEnt,parseStudent,pseudocode,walk } from '../src/parser';
import { csvCell } from '../src/export';
import { defaultNotebook,validateNotebook } from '../src/store';
import type { Project } from '../src/types';
const thread = (p: Project) => p.objects[0].script[0];
const body = (p: Project) => thread(p)[4].statements![0];
const eq = (p: Project) => body(p).find(b => b.type === 'if_else')!;
const direction = (p: Project) => eq(p).statements![1][0];
const rename = (p: Project,name: string) => {p.variables[1].name = name;};
const cases: [string,number,(p: Project) => void][] = [
 ['정상 프로그램',15,()=>{}],
 ['공백이 있는 변수명',15,p=>rename(p,'정답 횟수')],
 ['반복횟수 변수명',14,p=>rename(p,'반복횟수')],
 ['대답횟수 변수명',14,p=>rename(p,'대답횟수')],
 ['횟수 증가 없음',13,p=>{body(p).splice(1,1);}],
 ['크기 비교가 정답횟수',13,p=>{direction(p).params![0]=compare('GREATER',v('count'));}],
 ['변수명 오류와 정답 변수 증가',12,p=>{rename(p,'반복횟수');body(p)[1].params![0]='secret';}],
 ['저장된 횟수가 3',14,p=>{p.variables[1].value=3;}],
 ['횟수에 난수 저장',13,p=>{thread(p)[2].params![0]='count';}],
 ['오답에만 횟수 증가',14,p=>{const inc=body(p).splice(1,1)[0];eq(p).statements![1].unshift(inc);}],
 ['정답에 고정값 저장',14,p=>{thread(p)[2].params![1]=text(10);}],
 ['정답 안내 없이 반복 종료만',14,p=>{eq(p).statements![0].shift();}],
 ['없는 변수 숨기기',14,p=>{thread(p)[1].params![0]='deleted';}],
 ['안내 방향 반대',13,p=>{direction(p).statements!.reverse();}],
 ['무관한 시작 안내',13,p=>{thread(p)[3]=say('안녕!');}],
];
describe('요구된 채점 회귀 사례',()=>{
 for (const [name,score,change] of cases) it(name,()=>{const p=demoProject();change(p);const g=gradeProject(p);expect(g.performance).toBe(score);expect(pendingCount(g)).toBe(0);if(score===15)expect(g.reasons).toBe('Perfect');});
});
describe('실행 경로와 불확실성',()=>{
 it('대답 > 정답이면 작은 수 안내',()=>{const p=demoProject();direction(p).params![0]=compare('GREATER',b('get_canvas_input_value'),v('secret'));direction(p).statements!.reverse();expect(gradeProject(p).performance).toBe(15);});
 it('LESS 비교도 순서를 반영',()=>{const p=demoProject();direction(p).params![0]=compare('LESS',v('secret'));direction(p).statements!.reverse();expect(gradeProject(p).performance).toBe(15);});
 it('정답 분기의 종료 뒤 증가는 실행되지 않음',()=>{const p=demoProject();const inc=body(p).splice(1,1)[0];eq(p).statements![0].push(inc);eq(p).statements![1].unshift(inc);expect(gradeProject(p).performance).toBe(14);});
 it('다른 오브젝트의 숨기기도 검사',()=>{const p=demoProject();const hide=thread(p).splice(1,1)[0];p.objects.push({name:'교실',script:[[b('when_run_button_click'),hide]]});expect(gradeProject(p).performance).toBe(15);});
 it('이름으로 삭제된 변수 ID를 대체하지 않음',()=>{const p=demoProject();(eq(p).params![0] as any).params[0]=v('deleted');expect(gradeProject(p).criteria[6].deduction).toBe(1);});
 it('모호한 안내는 무감점 검토',()=>{const p=demoProject();thread(p)[3]=say('내가 낸 문제를 맞춰봐');const g=gradeProject(p);expect(g.performance).toBe(15);expect(g.criteria[4].review).toBeTruthy();g.criteria[4].decision='deduct';expect(recalculate(g).performance).toBe(13);});
 it('큼/작음은 검토',()=>{const p=demoProject();direction(p).statements=[[say('큼')],[say('작음')]];const g=gradeProject(p);expect(g.performance).toBe(15);expect(pendingCount(g)).toBe(2);});
 it('중복 게임은 검토',()=>{const p=demoProject();p.objects.push({name:'중복',script:p.objects[0].script});expect(gradeProject(p).notices.length).toBeGreaterThan(0);});
 it('단일 변수명 문제는 수행에서 한 번만 감점',()=>{const p=demoProject();p.variables[0].name='답';rename(p,'시도');expect(gradeProject(p).performance).toBe(14);});
 it('알 수 없는 제어 블록은 자동 확정하지 않음',()=>{const p=demoProject();thread(p).push(b('stop_run'));expect(pendingCount(gradeProject(p))).toBeGreaterThan(0);});
 it('반복 안 초기화는 감점',()=>{const p=demoProject();body(p).unshift(b('set_variable',['count',text(0)]));expect(gradeProject(p).performance).toBe(14);});
});
describe('파일 식별과 입력 검증',()=>{
 for(const filename of ['20712박은기.ent','20712_박은기.ent','PC-12_20712_박은기.ent'])it(filename,()=>expect(parseStudent(filename)).toEqual({id:'20712',grade:2,classNo:7,number:12,name:'박은기'}));
 it('학번 없는 파일은 수동 확인',()=>expect(parseStudent('샘플..ent')).toBeUndefined());
 it('6자리 중간을 학번으로 읽지 않음',()=>expect(parseStudent('120712.ent')).toBeUndefined());
 it('손상된 gzip은 거부',()=>expect(()=>parseEnt(new Uint8Array([1,2,3]))).toThrow());
 it('script 문자열을 한 번 더 파싱',()=>{const p=demoProject();const raw={...p,objects:p.objects.map(o=>({...o,script:JSON.stringify(o.script)}))};expect(normalizeProject(raw)).toEqual(p);});
 it('의사코드에 분기와 변수 이름 표시',()=>{const code=pseudocode(demoProject());expect(code).toContain('branch0 · 참');expect(code).toContain('정답횟수');expect(code).toContain('repeat_inf');});
 it('잘못된 백업을 거부',()=>{const d=defaultNotebook();expect(validateNotebook(d)).toEqual(d);expect(()=>validateNotebook({...d,settings:{...d.settings,rows:9999}})).toThrow();});
 it('CSV 수식 주입을 텍스트로 처리',()=>{expect(csvCell('=1+1')).toBe('"\'=1+1"');expect(csvCell('홍길동')).toBe('"홍길동"');});
});
