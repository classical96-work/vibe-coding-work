import type { Block, Project } from './types';
export const b = (type: string, params: unknown[] = [], statements: Block[][] = []): Block => ({type,params,statements});
export const text = (s: string | number) => b('text',[String(s)]);
export const v = (id: string) => b('get_variable',[id,null]);
export const say = (s: string | Block) => b('dialog_time',[typeof s === 'string' ? text(s) : s,text(2),'speak',null]);
export const compare = (op: string, left = v('secret'), right = b('get_canvas_input_value',[null])) => b('boolean_basic_operator',[left,op,right]);
export function demoProject(): Project {
  return {
    variables:[{id:'secret',name:'정답',visible:true,value:0,variableType:'variable'},{id:'count',name:'정답횟수',value:0,visible:true,variableType:'variable'}],
    objects:[{name:'선생님',script:[[
      b('when_run_button_click',[null]), b('hide_variable',['secret',null]),
      b('set_variable',['secret',b('calc_rand',[null,text(1),null,text(100),null]),null]),
      say('내가 생각한 숫자를 맞춰보세요!'),
      b('repeat_inf',[null,null],[[
        b('ask_and_wait',[text('숫자를 입력해 주세요'),null]),
        b('change_variable',['count',text(1),null]),
        b('if_else',[compare('EQUAL'),null,null],[
          [say('정답입니다!'), b('stop_repeat',[null])],
          [b('if_else',[compare('GREATER'),null,null],[[say('그것보다 큽니다.')],[say('그것보다 작습니다.')]])]
        ])
      ]]),
      say(b('combine_something',[null,v('count'),null,text('번 만에 맞췄습니다.'),null]))
    ]]}]
  };
}
