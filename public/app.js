const $ = (selector, root = document) => root.querySelector(selector);
const form = $('#joinForm'), joinDialog = $('#joinDialog'), sidDialog = $('#sidDialog'), provinceDialog = $('#provinceDialog');
const SID_KEY = 'onmader_map_sid', MEMBER_KEY = 'onmader_map_member';
const viewport = $('#mapViewport'), stage = $('#mapStage');
let members = [], zoom = 1, panX = 0, panY = 0, dragging = false, dragStart = null;
const activePointers = new Map(); let pinchStart = null;

// 坐标按根目录原始 map_china_2019.jpg 的完整画布（含南海诸岛和图例）校准。
const provinces = [
  { name:'北京', aliases:['北京市'], x:74.0,y:31.6 }, { name:'天津',aliases:['天津市'],x:76.3,y:33.0 },
  { name:'河北',aliases:['河北省'],x:73.7,y:34.3 }, { name:'山西',aliases:['山西省'],x:68.1,y:35.3 },
  { name:'内蒙古',aliases:['内蒙古自治区','内蒙古'],x:64.0,y:27.0 }, { name:'辽宁',aliases:['辽宁省'],x:84.7,y:27.5 },
  { name:'吉林',aliases:['吉林省'],x:88.0,y:22.4 }, { name:'黑龙江',aliases:['黑龙江省'],x:89.0,y:14.0 },
  { name:'上海',aliases:['上海市'],x:88.7,y:45.0 }, { name:'江苏',aliases:['江苏省'],x:82.5,y:43.6 },
  { name:'浙江',aliases:['浙江省'],x:84.6,y:50.4 }, { name:'安徽',aliases:['安徽省'],x:78.6,y:45.3 },
  { name:'福建',aliases:['福建省'],x:82.5,y:55.6 }, { name:'江西',aliases:['江西省'],x:76.3,y:54.5 },
  { name:'山东',aliases:['山东省'],x:81.3,y:37.3 }, { name:'河南',aliases:['河南省'],x:70.9,y:42.1 },
  { name:'湖北',aliases:['湖北省'],x:69.4,y:47.6 }, { name:'湖南',aliases:['湖南省'],x:68.8,y:54.3 },
  { name:'广东',aliases:['广东省'],x:72.0,y:60.5 }, { name:'广西',aliases:['广西壮族自治区','广西'],x:63.2,y:63.1 },
  { name:'海南',aliases:['海南省'],x:66.0,y:68.8 }, { name:'重庆',aliases:['重庆市'],x:60.0,y:50.6 },
  { name:'四川',aliases:['四川省'],x:51.0,y:49.0 }, { name:'贵州',aliases:['贵州省'],x:59.0,y:55.8 },
  { name:'云南',aliases:['云南省'],x:48.0,y:59.9 }, { name:'西藏',aliases:['西藏自治区','西藏'],x:19.4,y:44.7 },
  { name:'陕西',aliases:['陕西省'],x:62.6,y:40.1 }, { name:'甘肃',aliases:['甘肃省'],x:50.0,y:36.0 },
  { name:'青海',aliases:['青海省'],x:39.0,y:39.0 }, { name:'宁夏',aliases:['宁夏回族自治区','宁夏'],x:56.4,y:36.7 },
  { name:'新疆',aliases:['新疆维吾尔自治区','新疆'],x:20.8,y:28.7 }, { name:'台湾',aliases:['台湾省','台湾'],x:87.5,y:59.6 },
  { name:'香港',aliases:['香港特别行政区','香港'],x:76.0,y:64.0 }, { name:'澳门',aliases:['澳门特别行政区','澳门'],x:73.6,y:66.4 },
  { name:'海外',aliases:['海外'],x:10.0,y:64.0 }
];
const provinceByName = new Map();
for (const p of provinces) for (const alias of [p.name,...p.aliases]) provinceByName.set(normalizeProvince(alias),p);
function normalizeProvince(value) {
  return String(value || '').trim().replace(/\s/g,'').replace(/(维吾尔自治区|壮族自治区|回族自治区|特别行政区|自治区|省|市)$/,'');
}
function provinceFor(value) { return provinceByName.get(normalizeProvince(value)) || null; }
function normalizeCity(value) { return String(value||'').trim().replace(/(市|地区|盟|自治州)$/,''); }
function appendOption(select,value,label){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
function populateCities(prefix,provinceValue,selected=''){
  const select=form.elements[`${prefix}City`],overseas=provinceValue==='海外';
  select.replaceChildren();appendOption(select,'',overseas?'请选择国家 / 地区':'请选择市 / 地区');
  const options=overseas?window.COUNTRY_OPTIONS:(window.REGION_DATA.cities[provinceValue]||[]).map(name=>({value:name,label:name}));
  for(const option of options)appendOption(select,option.value,option.label);
  select.disabled=!provinceValue;
  if(selected){let match=options.find(option=>normalizeCity(option.value)===normalizeCity(selected));if(!match)match=options.find(option=>normalizeCity(option.value).includes(normalizeCity(selected))||normalizeCity(selected).includes(normalizeCity(option.value)));
    if(match)select.value=match.value;else{appendOption(select,selected,`现有记录：${selected}`);select.value=selected;}}
}
function setRegion(prefix,region){
  const provinceSelect=form.elements[`${prefix}Province`],citySelect=form.elements[`${prefix}City`];
  let province=window.REGION_DATA.provinces.find(item=>normalizeProvince(item.value)===normalizeProvince(region?.province));
  let city=region?.city||'';
  const englishProvinces={Beijing:'北京市',Tianjin:'天津市',Hebei:'河北省',Shanxi:'山西省','Inner Mongolia':'内蒙古自治区',Liaoning:'辽宁省',Jilin:'吉林省',Heilongjiang:'黑龙江省',Shanghai:'上海市',Jiangsu:'江苏省',Zhejiang:'浙江省',Anhui:'安徽省',Fujian:'福建省',Jiangxi:'江西省',Shandong:'山东省',Henan:'河南省',Hubei:'湖北省',Hunan:'湖南省',Guangdong:'广东省',Guangxi:'广西壮族自治区',Hainan:'海南省',Chongqing:'重庆市',Sichuan:'四川省',Guizhou:'贵州省',Yunnan:'云南省',Tibet:'西藏自治区',Shaanxi:'陕西省',Gansu:'甘肃省',Qinghai:'青海省',Ningxia:'宁夏回族自治区',Xinjiang:'新疆维吾尔自治区',Taiwan:'台湾省','Taiwan Province':'台湾省','Hong Kong':'香港特别行政区','Macao':'澳门特别行政区',Macau:'澳门特别行政区'};
  const provinceCodes={BJ:'北京市',TJ:'天津市',HE:'河北省',SX:'山西省',NM:'内蒙古自治区',LN:'辽宁省',JL:'吉林省',HL:'黑龙江省',SH:'上海市',JS:'江苏省',ZJ:'浙江省',AH:'安徽省',FJ:'福建省',JX:'江西省',SD:'山东省',HA:'河南省',HB:'湖北省',HN:'湖南省',GD:'广东省',GX:'广西壮族自治区',HI:'海南省',CQ:'重庆市',SC:'四川省',GZ:'贵州省',YN:'云南省',XZ:'西藏自治区',SN:'陕西省',GS:'甘肃省',QH:'青海省',NX:'宁夏回族自治区',XJ:'新疆维吾尔自治区',TW:'台湾省',HK:'香港特别行政区',MO:'澳门特别行政区'};
  if(!province&&region?.province)province=window.REGION_DATA.provinces.find(item=>item.value===englishProvinces[region.province]);
  if(!province&&region?.provinceCode)province=window.REGION_DATA.provinces.find(item=>item.value===provinceCodes[region.provinceCode.toUpperCase()]);
  if(region?.countryCode&&!['CN','HK','MO','TW'].includes(region.countryCode.toUpperCase())){
    province=window.REGION_DATA.provinces.find(item=>item.value==='海外');
    let localized=city;
    try{localized=new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(region.countryCode.toUpperCase())||city;}catch{}
    city=localized;
  }
  if(!province)return false;
  provinceSelect.value=province.value;populateCities(prefix,province.value,city);
  return Boolean(citySelect.value);
}
function initRegionSelects(){
  for(const prefix of ['home','active']){
    const provinceSelect=form.elements[`${prefix}Province`];
    for(const item of window.REGION_DATA.provinces)appendOption(provinceSelect,item.value,item.label);
    provinceSelect.addEventListener('change',()=>populateCities(prefix,provinceSelect.value));populateCities(prefix,'');
  }
}
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function regionText(r) { return [r?.province,r?.city].filter(Boolean).join('·'); }
function membersForProvince(province) {
  const key=province.name;
  const hometown=members.filter(m=>provinceFor(m.hometown?.province)?.name===key);
  const active=members.filter(m=>provinceFor(m.active?.province)?.name===key);
  const unique=new Set([...hometown,...active].map(m=>m.nickname));
  return { hometown,active,count:unique.size };
}
function renderBubbles() {
  $('#memberCount').textContent=members.length;
  const layer=$('#provinceBubbles'); layer.replaceChildren();
  const grouped=provinces.map(p=>({province:p,...membersForProvince(p)})).filter(x=>x.count>0).sort((a,b)=>a.count-b.count);
  for(const item of grouped){
    const diameter=Math.min(136,26+Math.sqrt(item.count)*20);
    const button=document.createElement('button'); button.type='button'; button.className='province-bubble';
    button.style.left=`${item.province.x}%`;button.style.top=`${item.province.y}%`;button.style.width=`${diameter}px`;button.style.height=`${diameter}px`;button.style.zIndex=String(Math.round(diameter));
    button.setAttribute('aria-label',`${item.province.name}，${item.count} 位成员`);
    button.innerHTML=`<span class="bubble-count">${item.count}</span><span class="bubble-name">${escapeHTML(item.province.name)}</span>`;
    button.addEventListener('pointerdown',e=>e.stopPropagation());
    button.addEventListener('click',e=>{e.stopPropagation();showProvince(item.province);});layer.append(button);
  }
}
function renderProvinceMembers(items,kind,provinceName){
  if(!items.length)return '<p class="province-empty">暂时还没有成员登记在这里。</p>';
  return `<div class="province-list">${items.map(m=>`<article class="member-chip ${kind==='active'?'active':''}">${m.biliUid?`<a class="member-bili-link" href="https://space.bilibili.com/${encodeURIComponent(m.biliUid)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHTML(m.nickname)}</strong><span aria-label="打开 B 站主页">↗</span></a>`:`<strong>${escapeHTML(m.nickname)}</strong>`}<small>${escapeHTML(regionText(kind==='active'?m.active:m.hometown)||provinceName)}</small></article>`).join('')}</div>`;
}
function showProvince(province){
  const groups=membersForProvince(province);$('#provinceTitle').textContent=`${province.name}的音 MADer`;
  $('#provinceSummary').textContent=`${groups.count} 位成员的家乡或最近活跃地在${province.name}`;
  $('#provinceGroups').innerHTML=`<section class="province-group"><h3>家乡在${province.name}的音 MADer 们</h3>${renderProvinceMembers(groups.hometown,'home',province.name)}</section><section class="province-group"><h3>最近在${province.name}活动的音 MADer 们</h3>${renderProvinceMembers(groups.active,'active',province.name)}</section>`;
  provinceDialog.showModal();
}
function renderSearch(){
  const query=$('#searchInput').value.trim().toLocaleLowerCase('zh-CN'),panel=$('#searchResults');
  if(!query){panel.hidden=true;panel.replaceChildren();return;}
  const found=members.filter(m=>[m.nickname,m.biliUid,m.hometown?.province,m.hometown?.city,m.active?.province,m.active?.city].some(v=>String(v||'').toLocaleLowerCase('zh-CN').includes(query)));
  panel.hidden=false;
  if(!found.length){panel.innerHTML='<div class="results-heading">搜索结果</div><div class="no-results">没有找到匹配的成员</div>';positionSearchResults();return;}
  panel.innerHTML=`<div class="results-heading"><span>匹配的成员</span><b>${found.length} 位</b></div>${found.slice(0,40).map((m,i)=>`<article class="result-row" data-result="${i}"><span class="result-name">${m.biliUid?`<a class="member-bili-link" href="https://space.bilibili.com/${encodeURIComponent(m.biliUid)}" target="_blank" rel="noopener noreferrer">${escapeHTML(m.nickname)}<span aria-label="打开 B 站主页">↗</span></a>`:escapeHTML(m.nickname)}</span><span class="result-meta">家乡：${escapeHTML(regionText(m.hometown)||'未填写')}<br>活动：${escapeHTML(regionText(m.active)||'未填写')}</span></article>`).join('')}`;
  panel.querySelectorAll('.result-row').forEach(row=>row.addEventListener('click',()=>{
    const m=found[Number(row.dataset.result)];panel.hidden=true;$('#searchInput').value=m.nickname;
    const p=provinceFor(m.active?.province)||provinceFor(m.hometown?.province);if(p)showProvince(p);
  }));
  positionSearchResults();
}
function positionSearchResults(){
  const panel=$('#searchResults');if(panel.hidden)return;
  const anchor=$('.search-box').getBoundingClientRect(),width=panel.getBoundingClientRect().width;
  const left=Math.max(12,Math.min(anchor.left,window.innerWidth-width-12));
  panel.style.left=`${left}px`;panel.style.top=`${anchor.bottom+8}px`;
}
async function loadMembers(){try{const r=await fetch('/api/members');if(!r.ok)throw new Error();members=await r.json();renderBubbles();}catch{$('#memberCount').textContent='—';}}

let transformFrame=0;
function updateTransform(){if(transformFrame)return;transformFrame=requestAnimationFrame(()=>{transformFrame=0;stage.style.transform=`translate(calc(-50% + ${panX}px),calc(-50% + ${panY}px)) scale(${zoom})`;});}
function setZoom(next,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){
  const old=zoom;zoom=Math.min(3.2,Math.max(.75,next));const centerX=viewport.clientWidth/2,centerY=viewport.clientHeight/2;
  panX=cx-centerX-((cx-centerX-panX)/old)*zoom;panY=cy-centerY-((cy-centerY-panY)/old)*zoom;viewport.classList.remove('dragging','pinching');updateTransform();
}
$('#zoomIn').addEventListener('click',()=>setZoom(zoom*1.2));$('#zoomOut').addEventListener('click',()=>setZoom(zoom/1.2));
$('#resetZoom').addEventListener('click',()=>{zoom=1;panX=panY=0;updateTransform();});
viewport.addEventListener('wheel',e=>{e.preventDefault();const rect=viewport.getBoundingClientRect();setZoom(zoom*(e.deltaY<0?1.12:1/1.12),e.clientX-rect.left,e.clientY-rect.top);},{passive:false});
viewport.addEventListener('pointerdown',e=>{
  activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});viewport.setPointerCapture(e.pointerId);
  if(activePointers.size===1){dragging=true;dragStart={x:e.clientX-panX,y:e.clientY-panY};viewport.classList.add('dragging');}
    if(activePointers.size===2){const pts=[...activePointers.values()],rect=viewport.getBoundingClientRect(),cx=(pts[0].x+pts[1].x)/2-rect.left,cy=(pts[0].y+pts[1].y)/2-rect.top;pinchStart={distance:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),zoom,panX,panY,cx,cy};dragging=false;viewport.classList.remove('dragging');viewport.classList.add('pinching');}
});
viewport.addEventListener('pointermove',e=>{
  if(!activePointers.has(e.pointerId))return;activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(activePointers.size>=2&&pinchStart){const pts=[...activePointers.values()],rect=viewport.getBoundingClientRect(),distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),cx=(pts[0].x+pts[1].x)/2-rect.left,cy=(pts[0].y+pts[1].y)/2-rect.top;const z=Math.min(3.2,Math.max(.75,pinchStart.zoom*distance/pinchStart.distance)),vx=viewport.clientWidth/2,vy=viewport.clientHeight/2;zoom=z;panX=cx-vx-((pinchStart.cx-vx-pinchStart.panX)/pinchStart.zoom)*zoom;panY=cy-vy-((pinchStart.cy-vy-pinchStart.panY)/pinchStart.zoom)*zoom;updateTransform();}
  else if(dragging){panX=e.clientX-dragStart.x;panY=e.clientY-dragStart.y;updateTransform();}
});
function finishPointer(e){activePointers.delete(e.pointerId);pinchStart=null;dragging=false;viewport.classList.remove('dragging','pinching');if(activePointers.size===1){const p=[...activePointers.values()][0];dragStart={x:p.x-panX,y:p.y-panY};dragging=true;viewport.classList.add('dragging');}}
viewport.addEventListener('pointerup',finishPointer);viewport.addEventListener('pointercancel',finishPointer);viewport.addEventListener('lostpointercapture',finishPointer);
for(const event of ['gesturestart','gesturechange','gestureend'])document.addEventListener(event,e=>e.preventDefault(),{passive:false});
$('#mapImage').addEventListener('error',()=>{$('#mapImage').hidden=true;$('#mapMissing').hidden=false;});

$('#searchInput').addEventListener('input',renderSearch);
window.addEventListener('resize',positionSearchResults);
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('#searchInput').focus();}if(e.key==='Escape')$('#searchResults').hidden=true;});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.search-wrap'))$('#searchResults').hidden=true;});
$('#closeProvince').addEventListener('click',()=>provinceDialog.close());

function reflectLogin(){
  const sid=localStorage.getItem(SID_KEY),saved=localStorage.getItem(MEMBER_KEY);
  $('#joinButton').textContent=sid?'修改信息':'让我加入吧！';$('#showSid').hidden=!sid;
  if(saved){try{const m=JSON.parse(saved);form.elements.nickname.value=m.nickname||'';form.elements.biliUid.value=m.biliUid||'';setRegion('home',m.hometown);setRegion('active',m.active);}catch{}}
}
function openSid(){$('#sidValue').textContent=localStorage.getItem(SID_KEY)||'—';sidDialog.showModal();}
$('#showSid').addEventListener('click',openSid);
$('#joinButton').addEventListener('click',()=>{$('#formTitle').textContent=localStorage.getItem(SID_KEY)?'修改我的信息':'加入地图';$('#formError').textContent='';$('#sidBlock').hidden=true;form.elements.sid.required=false;joinDialog.showModal();});
$('#closeDialog').addEventListener('click',()=>joinDialog.close());$('#closeSid').addEventListener('click',()=>sidDialog.close());
$('#copySid').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#sidValue').textContent);$('#copySid').textContent='已复制';}catch{$('#copySid').textContent='请长按代码复制';}});
form.addEventListener('submit',async e=>{
  e.preventDefault();$('#formError').textContent='';const data=Object.fromEntries(new FormData(form));
  const hasHome=Boolean(data.homeProvince&&data.homeCity),hasActive=Boolean(data.activeProvince&&data.activeCity);
  const partialHome=Boolean(data.homeProvince||data.homeCity)&&!hasHome,partialActive=Boolean(data.activeProvince||data.activeCity)&&!hasActive;
  if((!hasHome&&!hasActive)||partialHome||partialActive){$('#formError').textContent='家乡位置和活跃位置至少填写一项；填写某一项时请同时选择省份和城市。';return;}
  const payload={nickname:data.nickname,biliUid:data.biliUid,sid:data.sid||localStorage.getItem(SID_KEY)||'',hometown:{province:data.homeProvince,city:data.homeCity},active:{province:data.activeProvince,city:data.activeCity}};
  $('#submitButton').disabled=true;$('#submitButton').textContent='正在保存…';
  try{const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await r.json();
    if(r.status===409&&result.needsSid){$('#sidBlock').hidden=false;$('#sidPrompt').textContent=result.error;form.elements.sid.required=true;return;}
    if(!r.ok)throw new Error(result.error||'提交失败，请稍后重试。');
    localStorage.setItem(SID_KEY,result.map_sid);localStorage.setItem(MEMBER_KEY,JSON.stringify(result.member));form.elements.sid.required=false;$('#sidBlock').hidden=true;joinDialog.close();reflectLogin();await loadMembers();
  }catch(err){$('#formError').textContent=err.message;}
  finally{$('#submitButton').disabled=false;$('#submitButton').innerHTML='保存并加入地图 <span>→</span>';}
});
async function resolveCoordinates(lat,lon){
  const url=`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=zh`;
  const r=await fetch(url);if(!r.ok)throw new Error('坐标转换失败');const x=await r.json();let province=x.principalSubdivision||'',city=x.city||x.locality||x.localityInfo?.administrative?.[0]?.name||'';
  if(!city&&province)city=province.replace(/(省|自治区|特别行政区|市)$/,'');if(!province&&!x.countryCode)throw new Error('没有识别到省市');
  return{province:province.replace(/(省|自治区|特别行政区)$/,''),city:city||x.countryName||'',countryCode:x.countryCode||'CN'};
}
async function resolveIP(){const r=await fetch('https://ipapi.co/json/');if(!r.ok)throw new Error('IP 归属地服务暂不可用');const x=await r.json();if(x.error||!x.region||!x.city)throw new Error(x.reason||'IP 未能定位到城市');if(x.latitude&&x.longitude){try{return await resolveCoordinates(x.latitude,x.longitude);}catch{}}return{province:x.region,provinceCode:x.region_code,city:x.city,countryCode:x.country_code||'CN'};}
document.querySelectorAll('.locate').forEach(button=>button.addEventListener('click',async()=>{
  const target=button.dataset.target,prefix=target==='hometown'?'home':'active',old=button.textContent;button.disabled=true;button.textContent='正在获取位置…';
  const apply=r=>{if(!setRegion(prefix,r))throw new Error('未能匹配到省市选项，请手动选择地区。');};
  try{if(!navigator.geolocation)throw new Error('浏览器未提供定位');await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(async pos=>{try{apply(await resolveCoordinates(pos.coords.latitude,pos.coords.longitude));resolve();}catch(err){reject(err);}},reject,{enableHighAccuracy:true,timeout:10000,maximumAge:120000}));button.textContent='✓ 已填入设备定位';}
  catch{try{apply(await resolveIP());button.textContent='✓ 已填入 IP 归属地';}catch(err){button.textContent=old;$('#formError').textContent=`无法获取位置：${err.message}。也可以手动填写地区。`;}}
  finally{button.disabled=false;setTimeout(()=>{if(!button.disabled)button.textContent=old;},3200);}
}));
initRegionSelects();reflectLogin();loadMembers();updateTransform();
