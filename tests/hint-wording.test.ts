import {describe,it,expect} from 'vitest';
import {demoProject,say} from '../src/demo';
import {gradeProject,pendingCount} from '../src/grader';
import {sheetRows} from '../src/export';
import {defaultNotebook} from '../src/store';

function projectWithHints(big:string,small:string){
 const p=demoProject();
 p.objects[0].script[0][4].statements![0][2].statements![1][0].statements=[[say(big)],[say(small)]];
 return p;
}
const phrases=[['큼','작음'],['큼!','작음.'],['크다','작다'],['더 커','더 작아'],['큰 수야','작은 수야'],['큽니당','작슴니다'],['그것보다 큼','그것보다 작음'],['큼니다','작읍니다']];
describe('⑧⑨ 문장 길이·말투·알아볼 수 있는 오타 허용',()=>{
 it.each(phrases)('%s / %s는 확정 통과',(big,small)=>{
  const g=gradeProject(projectWithHints(big,small));
  expect(g.performance).toBe(15);expect(pendingCount(g)).toBe(0);expect(g.reasons).toBe('Perfect');
 });
 it.each(phrases)('%s / %s의 방향을 뒤바꾸면 두 항목 감점',(big,small)=>{
  const g=gradeProject(projectWithHints(small,big));
  expect(g.criteria[7].deduction).toBe(1);expect(g.criteria[8].deduction).toBe(1);expect(g.performance).toBe(13);expect(pendingCount(g)).toBe(0);
 });
 it('입력한 수를 주어로 쓴 축약형은 방향을 뒤집어 해석',()=>{
  const g=gradeProject(projectWithHints('입력한 수가 정답보다 작음','입력한 수가 정답보다 큼'));
  expect(g.reasons).toBe('Perfect');
 });
 it('주어가 불분명한 비교는 무감점 검토 유지',()=>{
  const g=gradeProject(projectWithHints('정답보다 작음','정답보다 큼'));
  expect(g.performance).toBe(15);expect(pendingCount(g)).toBe(2);expect(g.reasons).not.toBe('Perfect');
 });
 it('의미 없는 힌트는 통과하지 않음',()=>{
  const g=gradeProject(projectWithHints('안녕','가나다'));
  expect(g.performance).toBe(13);expect(g.criteria[7].deduction).toBe(1);expect(g.criteria[8].deduction).toBe(1);
 });
 it('오타 안내와 축약 힌트의 통과가 성적표 내보내기에도 반영',()=>{
  const p=projectWithHints('큼','작음');p.objects[0].script[0][3]=say('숫자 맟췄봐');const grade=gradeProject(p);
  const n=defaultNotebook();n.classes[1]={1:{name:'확인',performance:grade.performance,base:10,reasons:grade.reasons,submission:{key:'test',fileName:'20101_확인.ent',student:{id:'20101',grade:2,classNo:1,number:1,name:'확인'},grade,pseudocode:'',received:new Date().toISOString()}}};
  const row=sheetRows(n,1)[1];expect(row[2]).toBe(15);expect(row[5]).toBe('Perfect');expect(row[6]).not.toMatch(/검토/);
 });
});
