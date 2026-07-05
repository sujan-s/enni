function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function tzLabel(offsetMinutes: number): string {
  if (!offsetMinutes) return 'UTC'
  const sign = offsetMinutes < 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  const h = String(Math.floor(abs / 60)).padStart(2, '0')
  const m = String(abs % 60).padStart(2, '0')
  return `UTC${sign}${h}:${m}`
}

export interface DashboardOptions {
  siteName?: string
  utcOffsetMinutes?: number
}

/**
 * The self-contained admin page: inline CSS + JS, no external requests.
 * It fetches `?data=1&range=…` from its own mount path; the browser
 * re-sends the Basic auth credentials automatically.
 */
export function dashboardHtml(opts: DashboardOptions = {}): string {
  const site = esc(opts.siteName ?? '')
  const tz = tzLabel(opts.utcOffsetMinutes ?? 0)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${site ? `${site} · analytics` : 'Analytics'}</title>
<style>
:root{
  --page:#f9f9f7; --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --baseline:#c3c2b7; --border:rgba(11,11,11,.10);
  --s1:#2a78d6; --s2:#1baf7a;
  --good:#0ca30c; --warn:#fab219; --serious:#ec835a;
}
@media (prefers-color-scheme: dark){
  :root{
    --page:#0d0d0d; --surface:#1a1a19; --ink:#ffffff; --ink2:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --baseline:#383835; --border:rgba(255,255,255,.10);
    --s1:#3987e5; --s2:#199e70;
  }
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--page);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 20px 48px}
.wrap{max-width:1080px;margin:0 auto}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between;margin-bottom:20px}
h1{font-size:18px;font-weight:650}
h1 small{color:var(--muted);font-weight:400;font-size:13px;margin-left:8px}
.seg{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface)}
.seg button{appearance:none;border:0;background:none;color:var(--muted);font:inherit;font-size:13px;padding:6px 14px;cursor:pointer}
.seg button+button{border-left:1px solid var(--border)}
.seg button[aria-pressed="true"]{color:var(--ink);font-weight:600;background:var(--page)}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px;min-width:0}
.card.wide{grid-column:1/-1}
.card h2{font-size:13px;font-weight:600;color:var(--ink2);margin-bottom:12px}
.hero{display:flex;gap:28px;align-items:flex-end;flex-wrap:wrap}
.hero .n{font-size:40px;font-weight:650;line-height:1.1}
.hero .cap{color:var(--muted);font-size:12px}
.trend{flex:1;min-width:220px;height:64px;display:flex;align-items:flex-end;gap:2px;border-bottom:1px solid var(--baseline);padding-bottom:1px}
.trend i{flex:1;background:var(--s1);border-radius:2px 2px 0 0;min-height:2px;opacity:.9}
.trend i:hover{opacity:1}
.trend-x{display:flex;justify-content:space-between;color:var(--muted);font-size:11px;margin-top:4px;font-variant-numeric:tabular-nums}
.row{margin-bottom:10px}
.row-top{display:flex;justify-content:space-between;gap:12px;font-size:13px;margin-bottom:3px}
.row-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.row-n{color:var(--ink2);font-variant-numeric:tabular-nums}
.row-bar{height:5px;border-radius:2.5px;background:var(--s1)}
.row-bar.alt{background:var(--s2)}
.empty{color:var(--muted);font-size:13px}
.note{color:var(--muted);font-size:12px;margin-top:28px}
.err{background:var(--surface);border:1px solid var(--serious);border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:13px;display:none}
svg text{font:11px system-ui,-apple-system,"Segoe UI",sans-serif;fill:var(--ink2)}
.ribbon{fill:var(--s1);opacity:.22;cursor:default}
.ribbon:hover{opacity:.5}
.node{fill:var(--s1)}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--page);font-size:12px;padding:4px 8px;border-radius:6px;display:none;z-index:9;max-width:360px;overflow-wrap:break-word}
.vrow{margin-bottom:14px}
.vrow .vt{display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px}
.vbar{display:flex;gap:2px;height:8px}
.vbar i{border-radius:2px}
.vkey{color:var(--muted);font-size:12px;margin-top:4px}
table.plain{width:100%;border-collapse:collapse;font-size:13px}
table.plain td{padding:4px 0;border-bottom:1px solid var(--grid);vertical-align:top}
table.plain td:last-child{text-align:right;color:var(--ink2);font-variant-numeric:tabular-nums;white-space:nowrap;padding-left:12px}
table.plain tr:last-child td{border-bottom:0}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1><span id="site">${site}</span><small>analytics · enni</small></h1>
    <div class="seg" role="group" aria-label="Range">
      <button data-range="day">Today</button>
      <button data-range="week" aria-pressed="true">7 days</button>
      <button data-range="month">30 days</button>
    </div>
  </header>
  <div class="err" id="err"></div>
  <div class="grid" id="grid">
    <div class="card wide">
      <div class="hero">
        <div><div class="n" id="pv">–</div><div class="cap" id="pvcap">pageviews</div></div>
        <div style="flex:1;min-width:220px" id="trendwrap">
          <div class="trend" id="trend"></div>
          <div class="trend-x"><span id="d0"></span><span id="d1"></span></div>
        </div>
      </div>
    </div>
    <div class="card"><h2>Top pages</h2><div id="pages"></div></div>
    <div class="card"><h2>Countries</h2><div id="countries"></div></div>
    <div class="card"><h2>Referrers</h2><div id="referrers"></div></div>
    <div class="card"><h2>Devices</h2><div id="devices"></div></div>
    <div class="card wide" id="flowcard"><h2>Navigation flows</h2><div id="flows"></div></div>
  </div>
  <p class="note">Counters only — no cookies, no identifiers, nothing per-visitor. Days are ${tz}.</p>
</div>
<div id="tip"></div>
<script>
(function(){
  'use strict';
  var state=null, range='week';
  var $=function(id){return document.getElementById(id)};
  var el=function(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
  var fmt=function(n){return n.toLocaleString()};
  if(!$('site').textContent)$('site').textContent=location.hostname;

  var tip=$('tip');
  var tipShow=function(text,ev){tip.textContent=text;tip.style.display='block';tipMove(ev)};
  var tipMove=function(ev){
    var x=ev.clientX+12,y=ev.clientY+12;
    if(x+tip.offsetWidth>innerWidth-8)x=ev.clientX-tip.offsetWidth-8;
    if(y+tip.offsetHeight>innerHeight-8)y=ev.clientY-tip.offsetHeight-8;
    tip.style.left=x+'px';tip.style.top=y+'px';
  };
  var tipHide=function(){tip.style.display='none'};
  var hover=function(node,textFn){
    node.addEventListener('mouseenter',function(ev){tipShow(textFn(),ev)});
    node.addEventListener('mousemove',tipMove);
    node.addEventListener('mouseleave',tipHide);
  };

  function rows(mount,items,opts){
    opts=opts||{};
    mount.textContent='';
    if(!items.length){mount.appendChild(el('div','empty','Nothing counted yet in this range.'));return}
    var max=items[0].count;
    for(var i=0;i<items.length;i++)max=Math.max(max,items[i].count);
    items.slice(0,opts.limit||12).forEach(function(it,idx){
      var row=el('div','row');
      var topline=el('div','row-top');
      var label=el('span','row-label',opts.label?opts.label(it):it.value);
      label.title=it.value;
      topline.appendChild(label);
      topline.appendChild(el('span','row-n',fmt(it.count)));
      row.appendChild(topline);
      var bar=el('div','row-bar'+(opts.alt&&opts.alt(it,idx)?' alt':''));
      bar.style.width=Math.max(1.5,it.count/max*100)+'%';
      row.appendChild(bar);
      mount.appendChild(row);
    });
  }

  function table(mount,items,limit){
    mount.textContent='';
    if(!items.length){mount.appendChild(el('div','empty','Nothing counted yet in this range.'));return}
    var t=el('table','plain');
    items.slice(0,limit||12).forEach(function(it){
      var tr=el('tr');
      var td=el('td');td.textContent=it.value;td.title=it.value;
      tr.appendChild(td);
      tr.appendChild(el('td',null,fmt(it.count)));
      t.appendChild(tr);
    });
    mount.appendChild(t);
  }

  var regionNames=null;
  try{regionNames=new Intl.DisplayNames(['en'],{type:'region'})}catch(e){}
  function countryLabel(code){
    var name=code;
    if(regionNames){try{name=regionNames.of(code)||code}catch(e){}}
    var flag='';
    if(/^[A-Z]{2}$/.test(code))
      flag=String.fromCodePoint(code.charCodeAt(0)+127397,code.charCodeAt(1)+127397)+' ';
    return flag+name;
  }

  function trend(byDay){
    var wrap=$('trendwrap'),mount=$('trend');
    mount.textContent='';
    if(byDay.length<2){wrap.style.display='none';return}
    wrap.style.display='';
    var max=1;
    byDay.forEach(function(d){max=Math.max(max,d.count)});
    byDay.forEach(function(d){
      var bar=el('i');
      bar.style.height=Math.max(3,d.count/max*100)+'%';
      hover(bar,function(){return d.day+' · '+fmt(d.count)});
      mount.appendChild(bar);
    });
    $('d0').textContent=byDay[0].day;
    $('d1').textContent=byDay[byDay.length-1].day;
  }

  function trunc(s,n){return s.length>n?s.slice(0,n-1)+'…':s}

  function sankey(mount,flows){
    mount.textContent='';
    if(!flows.length){mount.appendChild(el('div','empty','Flows appear once visitors move between pages.'));return}
    flows=flows.slice(0,18);
    var NS='http://www.w3.org/2000/svg';
    var sums=function(key){
      var m=new Map();
      flows.forEach(function(f){m.set(f[key],(m.get(f[key])||0)+f.count)});
      return Array.from(m,function(kv){return{name:kv[0],total:kv[1],offset:0,y:0}})
        .sort(function(a,b){return b.total-a.total});
    };
    var L=sums('from'),R=sums('to');
    var GAP=6,H=280,X1=148,X2=492,W=8;
    var unitFor=function(side){
      var total=0;side.forEach(function(n){total+=n.total});
      return (H-GAP*(side.length-1))/total;
    };
    var unit=Math.min(unitFor(L),unitFor(R));
    var layout=function(side){
      var y=0;
      side.forEach(function(n){n.y=y;y+=n.total*unit+GAP});
    };
    layout(L);layout(R);
    var byName=function(side){var m={};side.forEach(function(n){m[n.name]=n});return m};
    var Lm=byName(L),Rm=byName(R);
    var svg=document.createElementNS(NS,'svg');
    svg.setAttribute('viewBox','0 0 640 '+H);
    svg.setAttribute('width','100%');
    svg.style.maxHeight='320px';
    var mid=(X1+X2)/2;
    flows.forEach(function(f){
      var a=Lm[f.from],b=Rm[f.to],h=f.count*unit;
      var y1=a.y+a.offset,y2=b.y+b.offset;
      a.offset+=h;b.offset+=h;
      var p=document.createElementNS(NS,'path');
      p.setAttribute('class','ribbon');
      p.setAttribute('d','M'+X1+','+y1+' C'+mid+','+y1+' '+mid+','+y2+' '+X2+','+y2+
        ' L'+X2+','+(y2+h)+' C'+mid+','+(y2+h)+' '+mid+','+(y1+h)+' '+X1+','+(y1+h)+' Z');
      hover(p,function(){return f.from+' → '+f.to+' · '+fmt(f.count)});
      svg.appendChild(p);
    });
    var nodes=function(side,x,anchor,tx){
      side.forEach(function(n){
        var h=Math.max(2,n.total*unit);
        var r=document.createElementNS(NS,'rect');
        r.setAttribute('class','node');
        r.setAttribute('x',x);r.setAttribute('y',n.y);
        r.setAttribute('width',W);r.setAttribute('height',h);
        r.setAttribute('rx',2);
        svg.appendChild(r);
        var t=document.createElementNS(NS,'text');
        t.setAttribute('x',tx);t.setAttribute('y',n.y+h/2+4);
        t.setAttribute('text-anchor',anchor);
        t.textContent=trunc(n.name,26);
        var tt=document.createElementNS(NS,'title');
        tt.textContent=n.name+' · '+fmt(n.total);
        t.appendChild(tt);
        svg.appendChild(t);
      });
    };
    nodes(L,X1-W,'end',X1-W-8);
    nodes(R,X2,'start',X2+W+8);
    mount.appendChild(svg);
    if(state&&state.flows.length>18)
      mount.appendChild(el('div','vkey','Top 18 flows of '+state.flows.length+'.'));
  }

  var EVENT_CARDS=[
    {key:'404',title:'404s'},
    {key:'s0',title:'Zero-result searches'},
    {key:'dl',title:'Downloads'}
  ];

  function vitalsCard(mount,items){
    mount.textContent='';
    var agg={lcp:{good:0,ok:0,poor:0},cls:{good:0,ok:0,poor:0},inp:{good:0,ok:0,poor:0}};
    items.forEach(function(it){
      var parts=it.value.split(':');
      if(agg[parts[0]]&&agg[parts[0]][parts[1]]!=null)agg[parts[0]][parts[1]]+=it.count;
    });
    var NAMES={lcp:'Largest contentful paint',cls:'Cumulative layout shift',inp:'Interaction to next paint'};
    var COLOURS={good:'var(--good)',ok:'var(--warn)',poor:'var(--serious)'};
    ['lcp','cls','inp'].forEach(function(k){
      var a=agg[k],total=a.good+a.ok+a.poor;
      if(!total)return;
      var row=el('div','vrow');
      var head=el('div','vt');
      head.appendChild(el('span',null,NAMES[k]));
      head.appendChild(el('span','row-n',fmt(total)));
      row.appendChild(head);
      var bar=el('div','vbar');
      var key=[];
      ['good','ok','poor'].forEach(function(b){
        if(!a[b])return;
        var seg=el('i');
        seg.style.width=(a[b]/total*100)+'%';
        seg.style.background=COLOURS[b];
        hover(seg,function(){return NAMES[k]+' · '+b+' · '+fmt(a[b])});
        bar.appendChild(seg);
        key.push(b+' '+Math.round(a[b]/total*100)+'%');
      });
      row.appendChild(bar);
      row.appendChild(el('div','vkey',key.join(' · ')));
      mount.appendChild(row);
    });
    if(!mount.childNodes.length)mount.appendChild(el('div','empty','No vitals reported yet.'));
  }

  function render(){
    var s=state;
    $('pv').textContent=fmt(s.pageviews);
    $('pvcap').textContent='pageviews · '+(range==='day'?'today':range==='week'?'last 7 days':'last 30 days');
    trend(s.byDay);
    rows($('pages'),s.pages,{limit:12});
    rows($('countries'),s.countries,{limit:12,label:function(it){return countryLabel(it.value)}});
    rows($('referrers'),s.referrers,{limit:12});
    rows($('devices'),s.devices,{alt:function(it){return it.value==='desktop'}});
    sankey($('flows'),s.flows);
    document.querySelectorAll('.card.evt').forEach(function(n){n.remove()});
    var grid=$('grid');
    EVENT_CARDS.forEach(function(c){
      var items=s.events[c.key];
      if(!items||!items.length)return;
      var card=el('div','card evt');
      card.appendChild(el('h2',null,c.title));
      var mount=el('div');card.appendChild(mount);
      table(mount,items);
      grid.appendChild(card);
    });
    if(s.events.vital&&s.events.vital.length){
      var card=el('div','card evt');
      card.appendChild(el('h2',null,'Web vitals'));
      var mount=el('div');card.appendChild(mount);
      vitalsCard(mount,s.events.vital);
      grid.appendChild(card);
    }
    Object.keys(s.events).sort().forEach(function(name){
      if(name==='vital')return;
      if(EVENT_CARDS.some(function(c){return c.key===name}))return;
      var items=s.events[name];
      if(!items.length)return;
      var card=el('div','card evt');
      card.appendChild(el('h2',null,'Event: '+name));
      var mount=el('div');card.appendChild(mount);
      table(mount,items);
      grid.appendChild(card);
    });
  }

  function load(){
    $('err').style.display='none';
    fetch(location.pathname+'?data=1&range='+range,{headers:{accept:'application/json'}})
      .then(function(res){
        if(!res.ok)throw new Error('HTTP '+res.status);
        return res.json();
      })
      .then(function(json){state=json;render()})
      .catch(function(e){
        var err=$('err');
        err.textContent='Could not load data ('+e.message+').';
        err.style.display='block';
      });
  }

  document.querySelectorAll('.seg button').forEach(function(btn){
    btn.addEventListener('click',function(){
      range=btn.dataset.range;
      document.querySelectorAll('.seg button').forEach(function(b){
        b.setAttribute('aria-pressed',String(b===btn));
      });
      load();
    });
  });
  load();
})();
</script>
</body>
</html>
`
}
