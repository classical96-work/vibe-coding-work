import {describe,it,expect} from 'vitest';
import {b,compare,demoProject,say,text,v} from '../src/demo';
import {gradeProject,pendingCount,recalculate} from '../src/grader';
import {sheetRows} from '../src/export';
import {defaultNotebook,validateNotebook} from '../src/store';
import type {Project,Submission} from '../src/types';
const thread=(p:Project)=>p.objects[0].script[0];
const body=(p:Project)=>thread(p)[4].statements![0];
function broken(){const p=demoProject();thread(p)[1].params![0]='missing';thread(p)[2].params![1]=text(5);thread(p)[3]=say('안녕!');body(p).splice(1,1);return p;}
function result(p:Project):Submission{return{key:'test',fileName:'20712_검증.ent',student:{id:'20712',grade:2,classNo:7,number:12,name:'검증'},grade:gradeProject(p),pseudocode:'test',received:new Date().toISOString()};}
describe('사용자 검토 의견 회귀',()=>{
 it('틀린 네 항목은 9점',()=>expect(gradeProject(broken()).performance).toBe(9));
 it.each(['wait_second','sound_something_with_block','custom_unknown_control'])('알 수 없는 %s 추가로 기존 감점·사유가 사라지지 않음',type=>{
  const p=broken(),original=gradeProject(p);thread(p).push(b(type,[text(1)]));const g=gradeProject(p);
  expect(g.performance).toBe(9);expect(g.reasons).toBe(original.reasons);expect(g.criteria.map(c=>[c.deduction,c.reason])).toEqual(original.criteria.map(c=>[c.deduction,c.reason]));expect(pendingCount(g)).toBeGreaterThan(0);
 });
 it('정상 작품에 소리 추가는 15점 잠정·검토, Perfect 확정 아님',()=>{
  const p=demoProject();body(p)[2].statements![0].unshift(b('sound_something_with_block'));
  const g=gradeProject(p);expect(g.performance).toBe(15);expect(g.reasons).not.toBe('Perfect');expect(g.criteria.every(c=>c.deduction===0)).toBe(true);expect(pendingCount(g)).toBeGreaterThan(0);
 });
 it('정답만 남는 LESS/GREATER 나머지 분기는 EQUAL 없이도 정답 인정',()=>{
  const p=demoProject();body(p)[2]=b('if_else',[compare('GREATER')],[[say('그것보다 큽니다')],[b('if_else',[compare('LESS')],[[say('그것보다 작습니다')],[say('정답입니다'),b('stop_repeat')]])]]);
  expect(gradeProject(p).performance).toBe(15);expect(pendingCount(gradeProject(p))).toBe(0);
 });
 it('크기 비교를 먼저 했어도 정답 안내 누락은 감점',()=>{
  const p=demoProject();body(p)[2]=b('if_else',[compare('LESS')],[[say('그것보다 작습니다')],[b('if_else',[compare('GREATER')],[[say('그것보다 큽니다')],[b('stop_repeat')]])]]);
  expect(gradeProject(p).performance).toBe(14);
 });
 it('공통 시작 안내의 정답 단어를 정답 분기 안내로 인정하지 않음',()=>{
  const p=demoProject();thread(p)[3]=say('정답 숫자를 맞춰보세요');body(p)[2].statements![0].shift();expect(gradeProject(p).performance).toBe(14);
 });
 it('정답보다 작아요/커요는 감점 대신 검토',()=>{
  const p=demoProject(),direction=body(p)[2].statements![1][0];direction.statements=[[say('정답보다 작아요')],[say('정답보다 커요')]];
  const g=gradeProject(p);expect(g.performance).toBe(15);expect(g.criteria[7].review).toBeTruthy();expect(g.criteria[8].review).toBeTruthy();expect(g.reasons).not.toBe('Perfect');
 });
 it('명시적인 입력 주어의 작아요/커요는 올바른 방향으로 인정',()=>{
  const p=demoProject(),direction=body(p)[2].statements![1][0];direction.statements=[[say('입력한 수가 정답보다 작아요')],[say('입력한 수가 정답보다 커요')]];
  expect(gradeProject(p).reasons).toBe('Perfect');
 });
 it('알 수 없는 조건식 때문에 확실한 시작 안내·난수 감점까지 지우지 않음',()=>{
  const p=broken();body(p)[1].params![0]=b('unknown_condition');const g=gradeProject(p);expect(g.criteria[2].deduction).toBe(1);expect(g.criteria[4].deduction).toBe(2);
 });
 it('검토 전 엑셀 데이터에 Perfect 대신 검토 상태와 원래 감점 표시',()=>{
  const p=broken();thread(p).push(b('wait_second'));const s=result(p),n=defaultNotebook();n.classes[7]={12:{name:'검증',performance:s.grade.performance,base:10,reasons:s.grade.reasons,submission:s}};
  const row=sheetRows(n,7)[12];expect(row[2]).toBe(9);expect(row[5]).toContain('③');expect(row[6]).toContain('검토');
 });
 it('교사가 구조를 확인해도 원래 감점 유지',()=>{
  const p=broken();thread(p).push(b('wait_second'));const g=gradeProject(p);g.acknowledged=true;const approved=recalculate(g);expect(approved.performance).toBe(9);expect(approved.reasons).toContain('③');
 });
});

it('정답 분기의 불명 조건이 오답 쪽의 잘못된 변수 비교 감점을 지우지 않음',()=>{
 const p=demoProject();body(p)[2].statements![1][0].params![0]=compare('GREATER',v('count'));body(p)[2].statements![0].unshift(b('_if',[b('unknown_condition')],[[]]));
 const g=gradeProject(p);expect(g.criteria[7].deduction).toBe(1);expect(g.criteria[8].deduction).toBe(1);
});
