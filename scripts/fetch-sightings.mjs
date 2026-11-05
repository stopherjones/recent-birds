// Daily job: pulls recent eBird observations around a fixed point and
// resolves one reusable photo per species (Wikipedia main photo first,
// then a Wikimedia Commons search). Writes data/*.json for the page.
import { readFile, writeFile } from 'node:fs/promises';

const { EBIRD_API_KEY, EBIRD_LAT, EBIRD_LNG } = process.env;
if (!EBIRD_API_KEY || !EBIRD_LAT || !EBIRD_LNG) {
  throw new Error('Missing EBIRD_API_KEY, EBIRD_LAT or EBIRD_LNG');
}
const DIST_KM = 12;
const DAYS_BACK = 7;
const UA = 'recent-birds/1.0 (https://github.com/stopherjones/recent-birds)';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const AVOID = /\b(map|distribution|range|egg|nest|skull|feather|illustration|drawing|painting|stamp|logo|specimen)\b/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- eBird
const ebirdUrl = `https://api.ebird.org/v2/data/obs/geo/recent?lat=${EBIRD_LAT}&lng=${EBIRD_LNG}&dist=${DIST_KM}&back=${DAYS_BACK}`;
const er = await fetch(ebirdUrl, { headers: { 'X-eBirdApiToken': EBIRD_API_KEY } });
if (!er.ok) throw new Error(`eBird returned ${er.status}`);
const observations = await er.json();
if (!Array.isArray(observations)) throw new Error('Unexpected eBird response');
console.log(`eBird: ${observations.length} records`);

// ---- photo licence check (same rules as the page)
function metaText(v) { return String(v || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function reusableLicense(meta) {
  const short = metaText(meta.LicenseShortName?.value);
  const terms = metaText(meta.UsageTerms?.value);
  const text = `${short} ${terms}`.toLowerCase();
  if (/no.?derivatives|\bnd\b|non.?commercial|\bnc\b/.test(text)) return false;
  return /^cc by(-sa)?(\s|$)/i.test(short) || /public domain|cc0/.test(text);
}
function toPhoto(info, source) {
  const meta = info.extmetadata || {};
  if (!String(info.mime || '').startsWith('image/') || info.mime.includes('svg')) return null;
  if (!reusableLicense(meta)) return null;
  return {
    image: info.thumburl || info.url,
    source: info.descriptionurl || source,
    author: metaText(meta.Artist?.value || meta.Credit?.value) || 'Photographer not listed',
    license: metaText(meta.LicenseShortName?.value) || 'Licence details on source page'
  };
}
function commonsPage(title) {
  return 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(title.startsWith('File:') ? title : 'File:' + title);
}
async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`);
  return r.json();
}
async function wikiPageImage(name) {
  const d = await getJSON('https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', redirects: '1',
    titles: name, prop: 'pageimages', piprop: 'name'
  }));
  const file = d.query?.pages?.[0]?.pageimage;
  if (!file) return null;
  const c = await getJSON(COMMONS_API + '?' + new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', titles: 'File:' + file,
    prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '800'
  }));
  const info = c.query?.pages?.[0]?.imageinfo?.[0];
  return info ? toPhoto(info, commonsPage(file)) : null;
}
async function commonsSearch(name) {
  const d = await getJSON(COMMONS_API + '?' + new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', generator: 'search',
    gsrsearch: name, gsrnamespace: '6', gsrlimit: '10', prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata', iiurlwidth: '800'
  }));
  const pages = (d.query?.pages || []).sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    if (AVOID.test(p.title || '')) continue;
    const photo = toPhoto(info, commonsPage(p.title));
    if (photo) return photo;
  }
  return null;
}
async function findPhoto(sciName, comName) {
  for (const name of [sciName, comName].filter(Boolean)) {
    try { const p = await wikiPageImage(name); if (p) return p; }
    catch (e) { console.warn(`Wikipedia ${name}: ${e.message}`); }
  }
  for (const name of [sciName, comName].filter(Boolean)) {
    try { const p = await commonsSearch(name); if (p) return p; }
    catch (e) { console.warn(`Commons ${name}: ${e.message}`); }
  }
  return null;
}

// ---- photos: keep known results, look up new species, retry earlier misses
let photos = {};
try { photos = JSON.parse(await readFile('data/species-photos.json', 'utf8')); } catch {}
const species = new Map();
for (const o of observations) if (o.speciesCode) species.set(o.speciesCode, o);
const next = {};
for (const [code, o] of species) {
  if (photos[code]) { next[code] = photos[code]; continue; }
  next[code] = await findPhoto(o.sciName, o.comName);
  await sleep(300);
}
console.log(`photos: ${Object.values(next).filter(Boolean).length} of ${species.size} species`);

// ---- write (no coordinates are published)
await writeFile('data/sightings.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  radiusKm: DIST_KM,
  daysBack: DAYS_BACK,
  observations
}, null, 2) + '\n');
await writeFile('data/species-photos.json', JSON.stringify(next, null, 2) + '\n');
