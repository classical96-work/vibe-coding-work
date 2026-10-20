import {describe,it,expect} from 'vitest';
import {demoProject,say,text} from '../src/demo';
import {gradeProject,pendingCount} from '../src/grader';
const examples=[
 '1~10사이의 수 중 하나를 맞혀봐',
 '숫자를 맞춰봐','숫자를 맞혀 보세요!','수를 맞혀봐','수 맞춰봐','어떤 수인지 맞춰보렴',
 '내가 생각한 수를 맞혀봐','내가 생각한 숫자를 맞춰봐','숫자 맞춰봐','내가 생각한 숫자가 뭐게?',
 '1부터 10까지 숫자 중 하나를 맞추세요','1에서 100 사이의 숫자를 맞혀봐',
 '내사 생각한 수를 맞춰봐','숫자 마춰봐','숫자 맞쳐봐','숫자맞추기 게임을 시작합니다',
 '내가 고른 숫자를 추측해 보세요','어떤 숫자인지 알아내 봐','내가 생각한 숫자는 무엇일까요?',
];
describe('⑤ 시작 안내는 특정 문구 대신 숫자맞추기 의미로 인정',()=>{
 it.each(examples)('%s',message=>{const p=demoProject();p.objects[0].script[0][3]=say(message);const g=gradeProject(p);expect(g.criteria[4].deduction).toBe(0);expect(g.criteria[4].review).toBeUndefined();expect(g.performance).toBe(15);expect(pendingCount(g)).toBe(0);});
 it.each(['안녕!','가나다라마바사','맞춤법을 공부해요','정답입니다','숫자를 맞추지 마세요','숫자를 맞춰보지 마세요','숫자 맞추어보지 마세요','숫자나무책상','내 이름을 맞춰봐','숫자를 맞춰서 정렬하세요'])('무관하거나 맞추라는 안내가 아닌 문구는 인정하지 않음: %s',message=>{const p=demoProject();p.objects[0].script[0][3]=say(message);const g=gradeProject(p);expect(g.criteria[4].deduction).toBe(2);});
 it.each(['맞춰봐!','내가 낸 문제를 맞춰봐','정답을 맞혀 보세요'])('숫자 대상인지 확인 불가능한 일반 문장은 자동 통과하지 않음: %s',message=>{const p=demoProject();p.objects[0].script[0][3]=say(message);const g=gradeProject(p);expect(g.criteria[4].review).toBeTruthy();expect(g.criteria[4].deduction).toBe(0);});
 it('난수의 실제 범위는 안내 문구와 독립적으로 ③에서 확인',()=>{const p=demoProject();p.objects[0].script[0][3]=say('숫자를 맞춰봐');(p.objects[0].script[0][2].params![1] as any).params[3]=text(100);const g=gradeProject(p);expect(g.performance).toBe(14);expect(g.criteria[2].deduction).toBe(1);expect(g.criteria[4].deduction).toBe(0);expect(g.criteria[4].review).toBeUndefined();});
 it('시작 안내 자체가 없는 경우는 감점',()=>{const p=demoProject();p.objects[0].script[0].splice(3,1);expect(gradeProject(p).criteria[4].deduction).toBe(2);});
});
