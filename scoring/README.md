# US County Scoring System

A framework for scoring every US county-equivalent (3,144 units) across six categories plus a verification step, grouped into seven regions.

| File | What it is |
|---|---|
| [`PARAMETERS.md`](PARAMETERS.md) | Full definitions: scales, formulas, data sources, verification checks, benchmark counties |
| [`REGIONAL_PROFILES.md`](REGIONAL_PROFILES.md) | How History, Jobs, Language, Religion, Environment and Voting differ in each of the 7 regions |
| [`parameters.json`](parameters.json) | Machine-readable parameter definitions (IDs, weights, metrics, sources) |
| [`regions.json`](regions.json) | State → region / sub-region mapping, CA NorCal/SoCal split, secondary affinities |
| [`data/county_roster.csv`](data/county_roster.csv) | Every county with its region assignment, approximate geography, Mississippi side, and empty score columns |
| [`scripts/build-roster.mjs`](scripts/build-roster.mjs) | Regenerates the roster from `regions.json` + `parameters.json` |

```bash
cd scoring
npm install
npm run build:roster
```

**Status:** parameters and roster are defined. The score columns are empty until the data pipeline in `PARAMETERS.md` §5 is built.
