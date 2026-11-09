import {$,today} from './util.js';
import {setView} from './state.js';
import {renderHist} from './history.js';
import {renderTrend} from './trends.js';
import {renderInsights} from './insights-ui.js';
import {renderAch} from './ach-ui.js';
import {renderData} from './data.js';
import {updBanner} from './app.js';

export function show(name){
 setView(name);
 ['rate','today','res','hist','tr','ins','ach','data'].forEach(n=>$('#v'+n).classList.toggle('on',n===name));
 $('#nav').style.display=name==='rate'?'none':'flex';
 const tab={today:'nt',res:'nt',hist:'nh',tr:'ntr',ins:'ni',ach:'na',data:'nd'}[name];
 ['nt','nh','ntr','ni','na','nd'].forEach(i=>$('#'+i).classList.toggle('on',i===tab));
 if(name==='hist')renderHist();
 if(name==='tr')renderTrend();
 if(name==='ins')renderInsights();
 if(name==='ach')renderAch();
 if(name==='data')renderData();
 updBanner();
}

