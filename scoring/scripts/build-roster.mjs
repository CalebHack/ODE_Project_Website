// Builds data/county_roster.csv: one row per US county-equivalent (50 states + DC),
// pre-assigned to the 7-region scheme, with approximate geographic fields and
// empty columns for every scored sub-parameter defined in parameters.json.
//
// Run: npm install && npm run build:roster   (from the scoring/ directory)

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { feature } from 'topojson-client';
import { geoArea, geoCentroid } from 'd3-geo';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const topo = require('us-atlas/counties-10m.json');
const regions = JSON.parse(readFileSync(join(root, 'regions.json'), 'utf8'));
const params = JSON.parse(readFileSync(join(root, 'parameters.json'), 'utf8'));

const STATE_FIPS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
  '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
  '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
  '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
  '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
  '55': 'WI', '56': 'WY',
};

// --- Region lookup -------------------------------------------------------------
const stateToRegion = {};
for (const r of regions.regions) {
  for (const [sub, states] of Object.entries(r.subRegions)) {
    for (const s of states) stateToRegion[s] = { id: r.id, name: r.name, sub };
  }
}
const affinity = {};
for (const [key, v] of Object.entries(regions.secondaryAffinities)) {
  for (const f of v.fips) affinity[f] = key;
}
const soCal = new Set(regions.californiaSplit.SoCal);

// --- East/West of the Mississippi ---------------------------------------------
// The river is a state boundary everywhere except Minnesota and Louisiana.
const EAST_STATES = new Set(['AL', 'CT', 'DE', 'DC', 'FL', 'GA', 'IL', 'IN', 'KY', 'ME', 'MD', 'MA',
  'MI', 'MS', 'NH', 'NJ', 'NY', 'NC', 'OH', 'PA', 'RI', 'SC', 'TN', 'VT', 'VA', 'WV', 'WI']);
const MS_RIVER_OVERRIDES = {
  // Minnesota: east bank, river runs through, or north of the headwaters
  '27031': 'east', '27075': 'east', '27137': 'east', '27017': 'east', '27115': 'east',
  '27065': 'east', '27095': 'east', '27059': 'east', '27025': 'east', '27003': 'east',
  '27123': 'straddles', '27163': 'east', '27009': 'east', '27141': 'east',
  '27007': 'straddles', '27021': 'straddles', '27061': 'straddles', '27001': 'straddles',
  '27035': 'straddles', '27097': 'straddles', '27053': 'straddles', '27029': 'headwaters',
  '27071': 'headwaters_north', '27077': 'headwaters_north',
  // Louisiana: east bank (Florida Parishes) and parishes the river runs through
  '22125': 'east', '22037': 'east', '22091': 'east', '22105': 'east', '22117': 'east',
  '22103': 'east', '22063': 'east', '22033': 'east', '22087': 'east',
  '22047': 'straddles', '22005': 'straddles', '22093': 'straddles', '22095': 'straddles',
  '22089': 'straddles', '22051': 'straddles', '22071': 'straddles', '22075': 'straddles',
};
function mississippiSide(fips, st) {
  if (MS_RIVER_OVERRIDES[fips]) return MS_RIVER_OVERRIDES[fips];
  return EAST_STATES.has(st) ? 'east' : 'west';
}

// --- Geometry ------------------------------------------------------------------
const EARTH_RADIUS_MI = 3958.7613;
const features = feature(topo, topo.objects.counties).features;

const rows = [];
for (const f of features) {
  const st = STATE_FIPS[f.id.slice(0, 2)];
  if (!st) continue; // territories are outside the 7-region scheme
  rows.push({
    fips: f.id,
    name: f.properties.name,
    st,
    lon: geoCentroid(f)[0],
    lat: geoCentroid(f)[1],
    area: geoArea(f) * EARTH_RADIUS_MI ** 2,
    geo: 'us-atlas-10m',
  });
}

// --- Vintage corrections to 2023 county-equivalents ---------------------------
// Connecticut replaced its 8 counties with 9 planning regions (Census, 2022).
// Alaska's Valdez-Cordova Census Area split in 2019.
const DROP = new Set(['09001', '09003', '09005', '09007', '09009', '09011', '09013', '09015', '02261']);
const ADD = [
  ['09110', 'Capitol Planning Region', 'CT'],
  ['09120', 'Greater Bridgeport Planning Region', 'CT'],
  ['09130', 'Lower Connecticut River Valley Planning Region', 'CT'],
  ['09140', 'Naugatuck Valley Planning Region', 'CT'],
  ['09150', 'Northeastern Connecticut Planning Region', 'CT'],
  ['09160', 'Northwest Hills Planning Region', 'CT'],
  ['09170', 'South Central Connecticut Planning Region', 'CT'],
  ['09180', 'Southeastern Connecticut Planning Region', 'CT'],
  ['09190', 'Western Connecticut Planning Region', 'CT'],
  ['02063', 'Chugach Census Area', 'AK'],
  ['02066', 'Copper River Census Area', 'AK'],
];
const roster = rows.filter((r) => !DROP.has(r.fips));
for (const [fips, name, st] of ADD) {
  roster.push({ fips, name, st, lon: null, lat: null, area: null, geo: 'pending_gazetteer' });
}
roster.sort((a, b) => a.fips.localeCompare(b.fips));

// --- Score columns from parameters.json ---------------------------------------
const scoreCols = [];
for (const c of params.categories) {
  for (const p of c.parameters) scoreCols.push(p.id);
  scoreCols.push(`${c.key}_score`);
}
scoreCols.push('composite_score', 'regional_typicality', 'confidence_grade');

const header = ['fips', 'state', 'county', 'region_id', 'region', 'sub_region', 'ca_split',
  'secondary_affinity', 'centroid_lat', 'centroid_lon', 'area_sqmi_approx', 'mississippi_side',
  'geometry_source', ...scoreCols];

const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const lines = [header.join(',')];
for (const r of roster) {
  const reg = stateToRegion[r.st];
  lines.push([
    r.fips, r.st, r.name, reg.id, reg.name, reg.sub,
    r.st === 'CA' ? (soCal.has(r.fips) ? 'SoCal' : 'NorCal') : '',
    affinity[r.fips] ?? '',
    r.lat == null ? '' : r.lat.toFixed(4),
    r.lon == null ? '' : r.lon.toFixed(4),
    r.area == null ? '' : Math.round(r.area),
    mississippiSide(r.fips, r.st),
    r.geo,
    ...scoreCols.map(() => ''),
  ].map(esc).join(','));
}
writeFileSync(join(root, 'data', 'county_roster.csv'), lines.join('\n') + '\n');

const byRegion = {};
for (const r of roster) byRegion[stateToRegion[r.st].id] = (byRegion[stateToRegion[r.st].id] || 0) + 1;
console.log(`Wrote ${roster.length} county-equivalents`, byRegion);
