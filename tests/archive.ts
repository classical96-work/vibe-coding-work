import { gzipSync, strToU8 } from 'fflate';
import type { Project } from '../src/types';
export function archiveProject(project: Project): Uint8Array {
 const json=strToU8(JSON.stringify({...project,objects:project.objects.map(o=>({...o,script:JSON.stringify(o.script)}))}));
 const tar=new Uint8Array(512+Math.ceil(json.length/512)*512+1024);
 const field=(offset:number,length:number,value:string)=>tar.set(strToU8(value).slice(0,length),offset);
 field(0,100,'temp/project.json');field(100,8,'0000644\0');field(108,8,'0000000\0');field(116,8,'0000000\0');field(124,12,json.length.toString(8).padStart(11,'0')+'\0');field(136,12,'00000000000\0');field(148,8,'        ');field(156,1,'0');field(257,6,'ustar\0');field(263,2,'00');
 const sum=tar.slice(0,512).reduce((n,v)=>n+v,0);field(148,8,sum.toString(8).padStart(6,'0')+'\0 ');tar.set(json,512);
 return gzipSync(tar);
}
