import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseEnt,parseStudent,pseudocode} from '../src/parser';
import {gradeProject,pendingCount} from '../src/grader';
it.skipIf(!process.env.SAMPLE_ENT)('사용자 실제 .ent 파일: 압축 해제부터 최종 점수까지',()=>{
 const p=parseEnt(new Uint8Array(readFileSync(process.env.SAMPLE_ENT!)));
 const g=gradeProject(p);
 expect(g.performance).toBe(15);expect(g.total).toBe(25);expect(g.reasons).toBe('Perfect');expect(pendingCount(g)).toBe(0);
 expect(p.objects.length).toBe(2);expect(pseudocode(p)).toContain('정답횟수');expect(parseStudent('샘플..ent')).toBeUndefined();
});
