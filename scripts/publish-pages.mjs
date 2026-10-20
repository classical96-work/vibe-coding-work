import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
function git(args,input){
 const r=spawnSync('git',args,{encoding:'utf8',input,maxBuffer:5*1024*1024});
 if(r.error)throw r.error;
 if(r.status!==0)throw new Error(r.stderr||`git ${args[0]} failed (${r.status})`);
 return r.stdout.trim();
}
// Publish only the tested static page. Preserve the working branch and source files.
const html=readFileSync(new URL('../dist/index.html',import.meta.url));
const htmlObject=git(['hash-object','-w','--stdin'],html);
const nojekyllObject=git(['hash-object','-w','--stdin'],'');
const tree=git(['mktree'],`100644 blob ${htmlObject}\tindex.html\n100644 blob ${nojekyllObject}\t.nojekyll\n`);
const remote=git(['ls-remote','origin','refs/heads/gh-pages']);
const parent=remote ? git(['fetch','--quiet','origin','refs/heads/gh-pages']) || git(['rev-parse','FETCH_HEAD']) : undefined;
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const commit=git(['commit-tree',tree,...(parent?['-p',parent]:[])],`Publish Entry grading notebook ${version}\n`);
console.log('Publishing static HTML to gh-pages:',commit);
console.log(git(['push','origin',`${commit}:refs/heads/gh-pages`]));
console.log('Site URL after GitHub Pages is enabled: https://classical96-work.github.io/vibe-coding-work/');
console.log('One-time setup: Settings > Pages > Deploy from a branch > gh-pages > /(root) > Save.');
