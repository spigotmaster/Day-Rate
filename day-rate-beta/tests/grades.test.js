const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs');
const G=require('../grades.js');
const ds=n=>new Date(Date.UTC(2026,0,1)+n*864e5).toISOString().slice(0,10);
function make(n,f){const E={};for(let i=0;i<n;i++){const [m,p,c]=f(i);E[ds(i)]={m,p,c}}return E}
let seed=11;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
const rr=()=>1+Math.floor(rnd()*10);

test('the scoring formula matches src/state.js exactly (so grades rank the same score the app shows)',()=>{
 const src=fs.readFileSync(__dirname+'/../src/state.js','utf8');
 const block=src.slice(src.indexOf('/*SCORE*/'),src.indexOf('/*END*/')).replace(/export /g,'');
 const E=make(80,()=>[rr(),rr(),rr()]);
 const app=new Function('E',block+';return {H,comp,STATS:()=>STATS}')(E);
 const g=G.make(E);
 for(const k of Object.keys(E))assert.strictEqual(g.score(E[k]),app.H(E[k]),k);
 // a fractional (expected) rating goes through the same arithmetic
 const frac={m:6.4,p:5.2,c:7.9};
 assert.strictEqual(g.score(frac),app.H(frac));
});
test('bands: B is the centre, A needs the top quarter, F only the bottom 3%',()=>{
 assert.strictEqual(G.letterFor(.5),'B');
 assert.strictEqual(G.letterFor(.75),'A-');assert.strictEqual(G.letterFor(.749),'B+');
 assert.strictEqual(G.letterFor(.95),'A+');assert.strictEqual(G.letterFor(.8499),'A-');
 assert.strictEqual(G.letterFor(.029),'F');assert.strictEqual(G.letterFor(.03),'D');assert.strictEqual(G.letterFor(0),'F');
 // shares per letter over a smooth spread of 1000 days
 const share={};for(let i=0;i<1000;i++){const l=G.letterFor((i+.5)/1000);share[l]=(share[l]||0)+1}
 assert.ok(share['B']>=130&&share['B']<=150);
 assert.ok(share['F']<=35&&share['D']<=55);
 assert.ok(share['A+']+share['A']+share['A-']>=240&&share['A+']+share['A']+share['A-']<=260);
});
test('no grade until 7 rated days',()=>{
 const E=make(6,i=>[5+i%3,5,5]);const g=G.make(E);
 assert.strictEqual(g.ok,false);assert.strictEqual(g.overall(E[ds(0)]),null);assert.strictEqual(g.cat(E[ds(0)],'m'),null);
 E[ds(6)]={m:5,p:5,c:5};assert.strictEqual(G.make(E).ok,true);
});
test('ties share a rank: identical days all grade B, a lone best day grades A or better',()=>{
 const E=make(10,()=>[6,6,6]);const g=G.make(E);
 Object.keys(E).forEach(k=>{assert.strictEqual(g.overall(E[k]).l,'B');assert.strictEqual(g.cat(E[k],'p').l,'B')});
 const F=make(20,i=>i===5?[9,9,9]:[5,5,5]);const h=G.make(F);
 assert.ok(['A+','A','A-'].includes(h.overall(F[ds(5)]).l));
 assert.strictEqual(h.overall(F[ds(6)]).l,'B-'); // the many equal days sit just under the middle, still not a bad grade
});
test('percentile is monotone: a higher score never gets a lower grade',()=>{
 const E=make(120,()=>[rr(),rr(),rr()]);const g=G.make(E);
 const rows=Object.keys(E).map(k=>[g.score(E[k]),g.overall(E[k]).p]).sort((a,b)=>a[0]-b[0]);
 for(let i=1;i<rows.length;i++)assert.ok(rows[i][1]>=rows[i-1][1]-1e-12);
 const cats=Object.keys(E).map(k=>[E[k].m,g.cat(E[k],'m').pts]).sort((a,b)=>a[0]-b[0]);
 for(let i=1;i<cats.length;i++)assert.ok(cats[i][1]>=cats[i-1][1]);
});
test('category grades rank each category on its own ratings',()=>{
 const E=make(30,i=>[i%10+1,5,5]);const g=G.make(E);
 const lo=g.cat({m:1,p:5,c:5},'m'),hi=g.cat({m:10,p:5,c:5},'m');
 assert.ok(lo.pts<hi.pts);assert.ok(hi.top<=10);
 assert.strictEqual(g.cat({m:5,p:5,c:5},'p').l,'B'); // every productivity rating is 5
});
test('expected (fractional) ratings can be graded too',()=>{
 const E=make(40,()=>[rr(),rr(),rr()]);const g=G.make(E);
 const a=g.ofRating('m',3.4),b=g.ofRating('m',8.6);
 assert.ok(a.pts<b.pts);
 assert.ok(g.ofScore(g.score({m:7.5,p:7.5,c:7.5})).l);
});
test('top share is a whole percent between 1 and 100',()=>{
 const E=make(50,()=>[rr(),rr(),rr()]);const g=G.make(E);
 Object.keys(E).forEach(k=>{const t=g.overall(E[k]).top;assert.ok(Number.isInteger(t)&&t>=1&&t<=100)});
});
test('gpa averages grade points and maps back to a letter',()=>{
 assert.strictEqual(G.gpa([]),null);
 const x=G.gpa([{pts:4},{pts:3},{pts:3.3}]);
 assert.ok(Math.abs(x.gpa-3.4333)<1e-3);assert.strictEqual(x.letter,'B+');
 assert.strictEqual(G.letterOfGpa(4.3),'A+');assert.strictEqual(G.letterOfGpa(0),'F');assert.strictEqual(G.letterOfGpa(1),'D');
 for(const l of Object.keys(G.PTS))assert.strictEqual(G.letterOfGpa(G.PTS[l]),l);
});
test('causal grades only look backwards and only start once enough days exist',()=>{
 const a=[5,6,7,8,5,9,4,6,7,8];
 const c=G.causal(a,4);
 assert.strictEqual(c.slice(0,3).every(x=>x===null),true);
 assert.ok(c[3]);
 // adding LATER days never changes an earlier grade
 const c2=G.causal(a.concat([10,10,10,1,1]),4);
 for(let i=0;i<a.length;i++)assert.deepStrictEqual(c2[i],c[i]);
 // a first-ever high is the best so far
 assert.ok(['A+','A','A-'].includes(G.causal([1,2,3,4,5,6,7,8],4)[7].l));
});
test('week summary: Monday to Sunday, needs 3 rated days and 7 in the record, compares with the week before',()=>{
 // 2026-01-05 is a Monday
 const E=make(60,i=>{const w=Math.floor((i+3)/7);return [3+(w%6),3+(w%6),3+(w%6)]});
 const w=G.weekSummary(E,'2026-02-08'); // a Sunday
 assert.ok(w);assert.strictEqual(w.start,'2026-02-02');assert.strictEqual(w.n,7);
 assert.ok(w.letter&&w.prev&&w.prev.letter);
 const two={};for(let i=0;i<10;i++)two[ds(i)]=E[ds(i)];two['2026-01-20']={m:5,p:5,c:5};two['2026-01-21']={m:5,p:5,c:5};
 assert.strictEqual(G.weekSummary(two,'2026-01-25'),null);
 assert.strictEqual(G.weekSummary(make(5,()=>[5,5,5]),'2026-01-04'),null);
 assert.strictEqual(G.weekSummary(E,'nonsense'),null);
});
test('invalid entries are ignored, not graded',()=>{
 const E=make(10,()=>[5,5,5]);E['2026-03-01']={m:'x',p:5,c:5};E['2026-03-02']={m:11,p:5,c:5};
 const g=G.make(E);assert.strictEqual(g.n,10);assert.strictEqual(g.overall(E['2026-03-01']),null);
});

test('weekly goal: counts days at or above the letter, Monday to Sunday, and says whether it is still possible',()=>{
 // 2026-02-02 is a Monday. 40 plain days, then this week: Mon-Wed tens (A range), rest empty.
 const E=make(32,()=>[5,5,5]);for(const d of ['2026-02-02','2026-02-03','2026-02-04'])E[d]={m:10,p:10,c:10};
 const goal={n:3,min:'B+'};
 let p=G.goalProgress(E,'2026-02-04',goal);
 assert.deepStrictEqual([p.have,p.need,p.left,p.status],[3,3,4,'met']);
 p=G.goalProgress(E,'2026-02-04',{n:5,min:'B+'});assert.deepStrictEqual([p.have,p.left,p.status],[3,4,'on']);
 p=G.goalProgress(E,'2026-02-08',{n:6,min:'B+'});assert.deepStrictEqual([p.left,p.status],[1,'out']);   // Sunday, not rated: only today left
 E['2026-02-08']={m:10,p:10,c:10};
 p=G.goalProgress(E,'2026-02-08',{n:4,min:'A'});assert.ok(p.have>=1&&p.left===0);
 assert.strictEqual(G.goalProgress(E,'2026-02-04',{n:0,min:'B+'}),null);
 assert.strictEqual(G.goalProgress(E,'2026-02-04',{n:3,min:'Z'}),null);
 assert.strictEqual(G.goalProgress(make(5,()=>[5,5,5]),'2026-01-05',goal),null);   // fewer than 7 days: no grades
 assert.strictEqual(G.goalProgress(E,'2026-02-04',null),null);
});

test('suggested goal: needs 3 completed weeks, then lands on something met in about half to three quarters of them',()=>{
 assert.strictEqual(G.suggestGoal(make(14,()=>[5,5,5]),'2026-01-14'),null);
 const E=make(80,()=>[rr(),rr(),rr()]);
 const s=G.suggestGoal(E,'2026-03-20');
 assert.ok(s&&s.weeks>=3&&s.weeks<=8&&s.n>=1&&s.n<=7&&G.PTS[s.min]!=null);
 assert.ok(s.hit/s.weeks>=.4&&s.hit/s.weeks<=.8,JSON.stringify(s));
 assert.strictEqual(G.suggestGoal(E,'nope'),null);
});
test('average week: target is the mean of recent weekly GPAs; this week is ahead, behind or too early',()=>{
 assert.strictEqual(G.avgWeek(make(14,()=>[5,5,5]),'2026-01-14'),null);
 // 2026-03-23 is a Monday; 11 weeks before it are random, this week is set by hand
 const E=make(80,()=>[rr(),rr(),rr()]);
 for(const d of ['2026-03-23','2026-03-24','2026-03-25'])E[d]={m:10,p:10,c:10};
 let a=G.avgWeek(E,'2026-03-25');
 assert.strictEqual(a.status,'ahead');assert.ok(a.target.weeks>=3&&a.cur.n===3);
 for(const d of ['2026-03-23','2026-03-24','2026-03-25'])E[d]={m:1,p:1,c:1};
 assert.strictEqual(G.avgWeek(E,'2026-03-25').status,'behind');
 delete E['2026-03-24'];delete E['2026-03-25'];
 assert.strictEqual(G.avgWeek(E,'2026-03-25').status,'early');
});
