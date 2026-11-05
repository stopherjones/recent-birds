const $=id=>document.getElementById(id);
let photoMap={};
// Show at most SHOW species.
// Order: new species first (first recorded in the last two days), then the longest
// absence before the latest return (absenceDays), then the latest sighting.
const SHOW = 24;
const NEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const ts = s => Date.parse(String(s || '').replace(' ', 'T'));
function isNew(o) { return !!o.firstSeen && (Date.now() - ts(o.firstSeen)) < NEW_WINDOW_MS; }
function byPriority(a, b) {
  const n = Number(isNew(b)) - Number(isNew(a));
  if (n !== 0) return n;
  const ga = a.absenceDays ?? -1, gb = b.absenceDays ?? -1;   // no recorded absence sorts last
  if (ga !== gb) return gb - ga;
  return String(b.obsDt).localeCompare(String(a.obsDt));
}
 const workerInput=$('worker');
const DEFAULT_WORKER='https://ebird-api.chrisjones59.workers.dev';
workerInput.value=localStorage.getItem('birdsWorkerUrl')||DEFAULT_WORKER;
workerInput.addEventListener('change',()=>localStorage.setItem('birdsWorkerUrl',workerInput.value.trim().replace(/\/$/,'')));
function status(message,error=false){$('status').textContent=message;$('status').className='status'+(error?' error':'')}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function prettyDate(s){if(!s)return 'Date not supplied';const d=new Date(s.replace(' ','T')+'Z');return isNaN(d)?s:d.toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
function speciesLink(b){const name=esc(b.comName||'Unknown species');const code=String(b.speciesCode||'');if(!/^[a-z0-9]+$/i.test(code))return name;return `<a href="https://ebird.org/species/${code}" target="_blank" rel="noopener noreferrer">${name}</a>`}
let renderVersion=0;
const COMMONS_CACHE_PREFIX='birdsCommonsImageV3:';
let commonsErrors=[];
const COMMONS_API='https://commons.wikimedia.org/w/api.php';
function metadataText(value){const t=document.createElement('textarea');t.innerHTML=String(value||'');return t.value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()}
function reusableLicense(meta){const short=metadataText(meta?.LicenseShortName?.value||'');const terms=metadataText(meta?.UsageTerms?.value||'');const value=(short+' '+terms).toLowerCase();if(/no.?derivatives|\bnd\b|non.?commercial|\bnc\b/.test(value))return false;return /^cc by(?:-sa)?(?:\s|$)/i.test(short)||/public domain|cc0|pdm|pd-self|pd-usgov/.test(value)}
function commonsCacheKey(b){return COMMONS_CACHE_PREFIX+String(b.sciName||b.comName||'').toLowerCase().trim()}
function cachedCommonsImage(b){try{const item=JSON.parse(localStorage.getItem(commonsCacheKey(b))||'null');if(!item)return null;const age=Date.now()-(item.savedAt||0);if(age>(item.notFound?7:30)*86400000){localStorage.removeItem(commonsCacheKey(b));return null}return item}catch{return null}}
function saveCommonsImage(b,item){try{localStorage.setItem(commonsCacheKey(b),JSON.stringify({...item,savedAt:Date.now()}))}catch(e){console.warn('Could not cache Commons image',e)}}
async function searchCommons(query){const params=new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'12',prop:'imageinfo',iiprop:'url|mime|extmetadata',iiurlwidth:'800',origin:'*'});const response=await fetch(COMMONS_API+'?'+params.toString());if(!response.ok)throw new Error('Wikimedia Commons returned '+response.status);const data=await response.json();const pages=data.query?.pages||[];return pages.map(page=>{const info=page.imageinfo?.[0],meta=info?.extmetadata||{};return {title:String(page.title||'').replace(/^File:/,''),image:info?.thumburl||info?.url,source:info?.descriptionurl||'',author:metadataText(meta.Artist?.value||meta.Credit?.value||'Photographer not listed'),license:metadataText(meta.LicenseShortName?.value||meta.UsageTerms?.value||'Licence details on source page'),mime:info?.mime||'' ,meta, index:page.index??99}}).filter(item=>item.image&&item.source&&item.mime.startsWith('image/')&&!item.mime.includes('svg')&&reusableLicense(item.meta))}
function chooseCommonsImage(items,b){const words=String(b.comName||'').toLowerCase().split(/[^a-z]+/).filter(w=>w.length>2);const scientific=String(b.sciName||'').toLowerCase().split(/[^a-z]+/).filter(w=>w.length>2);const avoid=/\b(map|distribution|range|egg|nest|skull|feather|illustration|drawing|painting|stamp|logo|specimen)\b/i;return items.map(item=>{const title=item.title.toLowerCase();let score=100-item.index;if(scientific.some(w=>title.includes(w)))score+=25;if(words.length&&words.some(w=>title.includes(w)))score+=12;if(avoid.test(title))score-=80;return {...item,score}}).sort((a,b)=>b.score-a.score)[0]||null}
const CC_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.6"/><text x="12" y="16" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="currentColor">cc</text></svg>';
async function wikiPageImage(b){const title=b.sciName||b.comName;if(!title)return null;const p=new URLSearchParams({action:'query',format:'json',formatversion:'2',redirects:'1',titles:title,prop:'pageimages',piprop:'name',origin:'*'});const r=await fetch('https://en.wikipedia.org/w/api.php?'+p);if(!r.ok)throw new Error('Wikipedia returned '+r.status);const d=await r.json();const file=d.query?.pages?.[0]?.pageimage;if(!file)return null;const q=new URLSearchParams({action:'query',format:'json',formatversion:'2',titles:'File:'+file,prop:'imageinfo',iiprop:'url|mime|extmetadata',iiurlwidth:'800',origin:'*'});const c=await fetch(COMMONS_API+'?'+q);if(!c.ok)throw new Error('Wikimedia Commons returned '+c.status);const cd=await c.json();const info=cd.query?.pages?.[0]?.imageinfo?.[0];if(!info)return null;const meta=info.extmetadata||{};if(!String(info.mime||'').startsWith('image/')||info.mime.includes('svg')||!reusableLicense(meta))return null;return {image:info.thumburl||info.url,source:info.descriptionurl||'',title:file,author:metadataText(meta.Artist?.value||meta.Credit?.value||'Photographer not listed'),license:metadataText(meta.LicenseShortName?.value||meta.UsageTerms?.value||'Licence details on source page')}}
async function findCommonsImage(b){if(b.speciesCode&&Object.prototype.hasOwnProperty.call(photoMap,b.speciesCode))return photoMap[b.speciesCode];let failed=false;const cached=cachedCommonsImage(b);if(cached)return cached.notFound?null:cached;try{const w=await wikiPageImage(b);if(w){saveCommonsImage(b,w);return w}}catch(e){console.warn('Wikipedia image failed',e)}const queries=[b.sciName,b.comName].filter((v,i,a)=>v&&a.indexOf(v)===i);for(const query of queries){try{const items=await searchCommons(query);const chosen=chooseCommonsImage(items,b);if(chosen){const result={image:chosen.image,source:chosen.source,title:chosen.title,author:chosen.author,license:chosen.license};saveCommonsImage(b,result);return result}}catch(e){failed=true;commonsErrors.push(e.message);console.warn('Commons search failed for '+query,e)}}if(!failed)saveCommonsImage(b,{notFound:true});return null}
async function loadCommonsImages(birds,version){let found=0,checked=0;for(let i=0;i<birds.length;i+=3){if(version!==renderVersion)return;const batch=birds.slice(i,i+3);const results=await Promise.all(batch.map(findCommonsImage));if(version!==renderVersion)return;results.forEach((result,j)=>{const article=$('birds').querySelector(`[data-bird-index="${i+j}"]`);if(!article||!result)return;const placeholder=article.querySelector('.art');if(!placeholder)return;found++;const photo=document.createElement('div');photo.className='photo';const img=document.createElement('img');img.loading='lazy';img.src=result.image;img.alt=birds[i+j].comName||'Bird photograph';img.onerror=()=>{photo.remove();credit.remove()};photo.append(img);const credit=document.createElement('div');credit.className='photo-credit';credit.hidden=true;const link=document.createElement('a');link.href=result.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent=(result.author||'Photographer uncredited')+' · '+(result.license||'Licence details');credit.append(link);const btn=document.createElement('button');btn.type='button';btn.className='cc-btn';btn.setAttribute('aria-label','Show photo credit');btn.setAttribute('aria-expanded','false');btn.innerHTML=CC_ICON;btn.onclick=()=>{credit.hidden=!credit.hidden;btn.setAttribute('aria-expanded',String(!credit.hidden))};photo.append(btn);placeholder.replaceWith(photo);photo.insertAdjacentElement('afterend',credit)});checked+=batch.length}if(version===renderVersion){const had=commonsErrors.length>0;const err=had?` Errors: ${commonsErrors.slice(-2).join('; ')}`:'';commonsErrors=[];status(`Wikimedia Commons: photographs found for ${found} of ${checked} displayed species. Credits link to the original files.`+err,had&&found===0)}}
function render(data,coords,label){const sorted=[...data].sort(byPriority);const unique=[...new Map(sorted.map(x=>[x.speciesCode||x.comName,x])).values()];const birds=unique.slice(0,SHOW);const version=++renderVersion;
$('birds').innerHTML=birds.length?birds.map((b,i)=>`<article class="bird" data-bird-index="${i}"><div class="art" aria-hidden="true">❧</div><h2>${speciesLink(b)}</h2><div class="latin">${esc(b.sciName||'')}</div><div class="detail">${esc(b.locName||'Nearby')} · ${esc(prettyDate(b.obsDt))}${b.howMany?`<br>${esc(b.howMany)} reported`:''}</div><div class="tag">${b.obsReviewed?'Reviewed observation':'Recent report'}</div></article>`).join(''):`<div class="empty">No observations were returned for this area and period.<br>Try again later or increase the search radius.</div>`;
$('place').textContent=label||'YOUR LOCAL PATCH · LAST 7 DAYS';$('summary').textContent=`${unique.length} species recently reported within 10 km`;$('count').textContent=`${unique.length} species · ${data.length} records`;$('updated').textContent=`Updated ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · eBird`;
if(birds.length)loadCommonsImages(birds,version);
}
// Near me: widen the radius until SHOW species are found (or 50 km, eBird's maximum).
// Results are rendered after each step, so the first ones appear straight away.
const RADII = [5, 10, 25, 50];
async function load(lat,lng){
  const base=workerInput.value.trim().replace(/\/$/,'');
  if(!base){status('First add your deployed Cloudflare Worker URL in the box below.',true);return}
  $('locate').disabled=true;
  const found=new Map();          // speciesCode -> latest observation
  let radius=RADII[0];
  try{
    for(const km of RADII){
      radius=km;
      status(`Searching within ${km} km…`);
      const u=new URL(base+'/data/obs/geo/recent');
      u.searchParams.set('lat',lat); u.searchParams.set('lng',lng);
      u.searchParams.set('dist',String(km)); u.searchParams.set('back','7');
      const r=await fetch(u);
      if(!r.ok){const t=await r.text();throw new Error(`Worker returned ${r.status}: ${t.slice(0,180)}`)}
      const observations=await r.json();
      if(!Array.isArray(observations))throw new Error('Unexpected eBird response. Expected an array of observations.');
      for(const o of observations){
        if(!o.speciesCode) continue;
        const cur=found.get(o.speciesCode);
        if(!cur || String(o.obsDt)>String(cur.obsDt)) found.set(o.speciesCode,o);
      }
      const all=[...found.values()];
      render(all,{lat,lng},`YOUR LOCAL PATCH · ${km} KM · 7 DAYS`);
      if(found.size>=SHOW) break;
    }
    status(`Found ${Math.min(found.size,SHOW)} species within ${radius} km.`);
  }catch(e){status(e.message+' Check the Worker URL, secret and allowed origin.',true)}
  finally{$('locate').disabled=false}
}
$('locate').onclick=()=>{if(!navigator.geolocation){status('This browser does not support location services.',true);return}status('Requesting your location…');navigator.geolocation.getCurrentPosition(p=>load(p.coords.latitude,p.coords.longitude),e=>status(e.message+' You can allow location access in your browser settings.',true),{enableHighAccuracy:false,timeout:15000,maximumAge:300000})};

async function loadDaily(){
  try{
    const [sightings,photos]=await Promise.all([
      fetch('data/sightings.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('sightings file returned '+r.status);return r.json()}),
      fetch('data/species-photos.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({}))
    ]);
    photoMap=photos;
    render(sightings.observations||[],null,'YOUR LOCAL PATCH · 12 KM · 7 DAYS');
    status(`Updated ${new Date(sightings.generatedAt).toLocaleString('en-GB')}.`);
  }catch(e){status('Could not load the daily sightings: '+e.message,true)}
}
loadDaily();
