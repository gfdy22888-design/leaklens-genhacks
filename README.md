# LeakLens

**Find unusual water use. Inspect the evidence. Decide what needs a closer look.**

New prototype for GenHacks 2026, intended track: **Healthcare & Environmental**. Development started on **2 November 2026 (Asia/Singapore)**. It was built specifically for this entry; the neighbouring LedgerPilot project is separate and is not part of this submission.

## Run

For a server-free demo, open **`dist/LeakLens_离线演示.html`** in a modern browser. This generated single-file version embeds the styles and JavaScript. `npm run build` regenerates it from the source; it needs no network connection.

Node.js 22+; no packages, account, API key or installation needed.

```sh
npm start
```

Open `http://127.0.0.1:4181`. Use Mixed day → select a review event → expand source readings → choose a decision → save review → export evidence. `npm run check` checks syntax; `npm test` runs meaningful engine regression checks. Static files in `dist/` also work on a static HTTP host. ES modules require HTTP; do not open index.html directly through file://.

## What works

- Five reproducible synthetic scenarios: mixed day, continuous flow, planned irrigation, sensor gap and routine use.
- Browser-local CSV import, strict one-minute interval checking and timezone-aware timestamps.
- One-class k-nearest-neighbour novelty detection fitted on a selected reference period.
- A flow plot, review queue, source reading tables and nearest reference matches.
- Human decisions with notes and timestamps, exported with the complete source readings, model settings and window evidence as JSON.

No hardware, MQTT service or live meter is connected. This is a telemetry-analysis software prototype. All bundled readings are synthetic, not experimental observations. Imported readings remain in browser memory; the code has no upload, external inference or analytics endpoint. Hosting services still receive ordinary page requests. Refreshing or changing settings clears decisions; use Export evidence to keep them. The current version exports evidence but does not re-import a saved review packet.

## Model

The model is an inspectable, non-parametric one-class reference model, not a language model and not a trained leak classifier. Each complete, non-overlapping 15-minute window has four features: mean flow, 25th-percentile flow, fraction of minutes above 0.1 L/min and population standard deviation. Features are scaled by reference MAD × 1.4826 with floors of `[0.3, 0.2, 0.12, 0.4]` in the respective feature units. The distance is the root mean square of standardized feature differences. The average distance to the three nearest reference windows is compared against `max(1.5, 1.5 × reference leave-one-out 95th-percentile distance) / sensitivity`.

The displayed score is distance divided by that threshold. **It is not a probability, severity or estimate of lost water.** The continuous-flow label is an explanatory rule applied to flagged windows where all 15 readings exceed 0.1 L/min. It cannot distinguish a leak from irrigation or another intentional use.

At least four complete reference windows are required. Missing values stay missing and incomplete windows receive a quality flag rather than a model score. Timestamps must be increasing, exactly one minute apart; insert blank flow cells for unavailable minutes. Recorded litres are the sum of observed one-minute average flow values × one minute. The flow must represent the **average over the following one-minute interval**, not an instantaneous spot measurement. Window boundaries and the reference period affect which parts of an event are flagged.

## CSV contract

The header is exactly `timestamp,flow_lpm`. ISO timestamps must include a timezone. Flow must be finite and between 0 and 1000 L/min, or blank for missing. Accepts 120–10,080 rows and at most 2 MB. There are no quoted fields or extra columns.

```csv
timestamp,flow_lpm
2026-11-02T00:00:00Z,0
2026-11-02T00:01:00Z,1.2
2026-11-02T00:02:00Z,
```

The example above only illustrates the format; the app needs at least 120 readings. Click Sample CSV for a complete synthetic file.

## Reproducible evidence, not field accuracy

Default mixed-day data contain 1,440 readings, 20 missing minutes, 638.1 recorded litres and 4 grouped review events at balanced sensitivity with a six-hour reference. The routine-only synthetic scenario produces no events under those settings. These are fixture checks, **not** estimates of real-world precision, recall, false-positive rate or water savings. No real household or utility dataset has been used to validate the model. Baseline contamination, legitimate usage changes and intermittent leaks can cause misleading results. A field study with labelled meter data is required before operational use.

Reviews record actions in a browser tab, not authenticated people. The JSON export is neither signed nor an immutable audit record. No alerts, valve control, diagnosis or automatic external actions exist.


## AI disclosure
OpenAI Codex assisted with concept development, implementation, synthetic fixtures, tests and text. No external pretrained model or real household dataset is bundled. Development began 2 November 2026. This repository contains source code and a standalone offline demo. A browser walkthrough verified CSV import, three saved review decisions, a routine-use scenario and a JSON export with 1,440 readings. A narrated demo video has been produced locally; online video publication remains pending. Field accuracy and water savings have not been validated.

## License
MIT; see LICENSE.

