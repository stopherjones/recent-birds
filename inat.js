// Recent Birds: iNaturalist "Find nature on iNaturalist" mode.
// Loaded after js/app.js. Uses its globals: $, status, esc, CC_ICON, RADII, SHOW, render, kmBetween.
// ---- iNaturalist nature (near me, same distance steps as the eBird search) ----
const INAT_API='https://api.inaturalist.org/v1/observations';
const INAT_REUSE=/^(cc-by|cc-by-sa|cc0)$/;      // reusable licences only, as with Commons
function inatImage(p){
  let u=p&&(p.medium_url||p.large_url||p.url||p.square_url);
  if(typeof u!=='string')return '';
  u=u.replace(/\/square\.(jpg|jpeg|png)(\?.*)?$/i,'/medium.$1$2');
  return u.indexOf('https://')===0?u:'';
}
// Turn one iNaturalist observation into the same shape as an eBird observation.
// Returns null unless it has a reusable photo, so every card has a picture.
function inatToBird(o){
  const taxon=o.taxon||{};
  if(!taxon.id||!o.id)return null;
  const [la,ln]=String(o.location||'').split(',').map(Number);
  if(!isFinite(la)||!isFinite(ln))return null;
  const candidates=[taxon.default_photo,...(Array.isArray(o.photos)?o.photos:[])];
  const photo=candidates.find(p=>p&&INAT_REUSE.test(String(p.license_code||'').toLowerCase())&&inatImage(p));
  if(!photo)return null;
  return {
    source:'inat',
    speciesCode:String(taxon.id),
    comName:taxon.preferred_common_name||taxon.name||o.species_guess||'Nature observation',
    sciName:taxon.name||'',
    locName:o.place_guess||'Nearby',
    obsDt:o.observed_on||'',
    lat:la,lng:ln,
    obsUrl:'https://www.inaturalist.org/observations/'+encodeURIComponent(o.id),
    taxaUrl:'https://www.inaturalist.org/taxa/'+encodeURIComponent(taxon.id),
    photoUrl:inatImage(photo),
    photoCredit:photo.attribution||'Photo on iNaturalist',
    photoLicense:String(photo.license_code).toUpperCase(),
    photoLink:photo.id?'https://www.inaturalist.org/photos/'+encodeURIComponent(photo.id):'https://www.inaturalist.org/taxa/'+encodeURIComponent(taxon.id)
  };
}
function inatCard(b,i){
  const photo=`<div class="photo"><img src="${esc(b.photoUrl)}" alt="${esc(b.comName)}" loading="lazy"><button type="button" class="cc-btn" aria-label="Show photo credit" aria-expanded="false" onclick="var c=this.parentNode.nextElementSibling;c.hidden=!c.hidden;this.setAttribute('aria-expanded',String(!c.hidden))">${CC_ICON}</button></div><div class="photo-credit" hidden><a href="${esc(b.photoLink)}" target="_blank" rel="noopener noreferrer">${esc(b.photoCredit)} · ${esc(b.photoLicense)}</a></div>`;
  return `<article class="bird" data-bird-index="${i}">${photo}<h2><a href="${esc(b.taxaUrl)}" target="_blank" rel="noopener noreferrer">${esc(b.comName)}</a></h2><div class="latin">${esc(b.sciName)}</div><div class="detail">${esc(b.locName)} · ${esc(b.obsDt)}</div><div class="detail"><a href="${esc(b.obsUrl)}" target="_blank" rel="noopener noreferrer">Recent sighting on iNaturalist</a></div></article>`;
}
// Widen 5 → 10 → 25 → 50 km until SHOW species are found. Keeps the nearest sighting per species.
async function loadInat(lat,lng){
  const btn=$('inat');
  btn.disabled=true;
  $('share').hidden=true;
  const best=new Map();
  let radius=RADII[0];
  try{
    for(const km of RADII){
      radius=km;
      status(`iNaturalist: searching within ${km} km…`);
      const u=new URL(INAT_API);
      u.searchParams.set('lat',lat);u.searchParams.set('lng',lng);u.searchParams.set('radius',String(km));
      u.searchParams.set('quality_grade','research');
      u.searchParams.set('photos','true');u.searchParams.set('rank','species');
      u.searchParams.set('order','desc');u.searchParams.set('order_by','observed_on');
      u.searchParams.set('per_page','200');
      const r=await fetch(u);
      if(!r.ok)throw new Error(`iNaturalist returned ${r.status}.`);
      const data=await r.json();
      if(!data||!Array.isArray(data.results))throw new Error('Unexpected iNaturalist response.');
      for(const o of data.results){
        const b=inatToBird(o);
        if(!b)continue;
        const cur=best.get(b.speciesCode);
        if(!cur||kmBetween(lat,lng,b.lat,b.lng)<kmBetween(lat,lng,cur.lat,cur.lng))best.set(b.speciesCode,b);
      }
      render([...best.values()],{lat,lng},`NATURE NEAR YOU · ${km} KM · iNATURALIST`,km);
      if(best.size>=SHOW)break;
    }
    status(`Found ${best.size} species on iNaturalist within ${radius} km.`);
  }catch(e){status(e.message+' Please try again later.',true)}
  finally{btn.disabled=false}
}
$('inat').onclick=()=>{
  if(!navigator.geolocation){status('This browser does not support location services.',true);return}
  status('Requesting your location…');
  navigator.geolocation.getCurrentPosition(p=>loadInat(p.coords.latitude,p.coords.longitude),e=>status(e.message+' You can allow location access in your browser settings.',true),{enableHighAccuracy:false,timeout:15000,maximumAge:300000});
};
