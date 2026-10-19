import { parseEnt,pseudocode } from './parser';
import { gradeProject } from './grader';
self.onmessage = (event: MessageEvent<{bytes:ArrayBuffer;base:number}>) => {
  try {
    const project = parseEnt(new Uint8Array(event.data.bytes));
    const code = pseudocode(project);
    if (code.length > 300000) throw new Error('블록 구조가 너무 커서 저장·검토할 수 없습니다. 오브젝트나 블록 수를 확인해 주세요.');
    self.postMessage({grade:gradeProject(project,event.data.base),pseudocode:code});
  } catch(e) { self.postMessage({error:e instanceof Error ? e.message : '파일을 분석할 수 없습니다.'}); }
};
