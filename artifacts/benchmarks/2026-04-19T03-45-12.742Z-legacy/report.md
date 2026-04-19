# SpeedScope browser benchmark

Generated at: 2026-04-19T03:45:25.412Z

Experiment: legacy

Flags:

- deferDemangle: false
- optimizedForEachCall: false

## Fixture results

### chrome-timeline-large
- fixture: `sample/profiles/Chrome/65/timeline.json`
- format: chrome-timeline
- cold first paint: 269.30 ms
- cold total wall-clock: 269.40 ms
- warm first paint: median 198.00 ms, avg 189.35 ms, min 180.70 ms, max 198.00 ms
- warm total wall-clock: median 198.10 ms, avg 189.40 ms, min 180.70 ms, max 198.10 ms

### firefox-large
- fixture: `sample/profiles/Firefox/59/firefox.json`
- format: firefox
- cold first paint: 153.20 ms
- cold total wall-clock: 153.20 ms
- warm first paint: median 177.10 ms, avg 163.55 ms, min 150.00 ms, max 177.10 ms
- warm total wall-clock: median 177.30 ms, avg 163.65 ms, min 150.00 ms, max 177.30 ms

### instruments-random-allocations
- fixture: `sample/profiles/Instruments/16.0/simple-time-profile-deep-copy.txt`
- format: instruments-deep-copy
- cold first paint: 101.80 ms
- cold total wall-clock: 101.90 ms
- warm first paint: median 106.60 ms, avg 105.65 ms, min 104.70 ms, max 106.60 ms
- warm total wall-clock: median 106.70 ms, avg 105.75 ms, min 104.80 ms, max 106.70 ms

### stackprof-ruby-large
- fixture: `sample/profiles/stackprof/ruby-stackprof.json`
- format: stackprof
- cold first paint: 190.10 ms
- cold total wall-clock: 190.10 ms
- warm first paint: median 207.90 ms, avg 202.70 ms, min 197.50 ms, max 207.90 ms
- warm total wall-clock: median 207.90 ms, avg 202.70 ms, min 197.50 ms, max 207.90 ms

### chrome-cpuprofile-sucrase
- fixture: `sample/profiles/Chrome/65/sucrase.cpuprofile`
- format: chrome-cpu-profile
- cold first paint: 1045.00 ms
- cold total wall-clock: 1045.00 ms
- warm first paint: median 930.60 ms, avg 911.90 ms, min 893.20 ms, max 930.60 ms
- warm total wall-clock: median 930.70 ms, avg 912.00 ms, min 893.30 ms, max 930.70 ms

### chrome-trace-116
- fixture: `sample/profiles/Chrome/116/Trace-20230603T221323.json`
- format: chrome-trace-object
- cold first paint: 107.60 ms
- cold total wall-clock: 107.60 ms
- warm first paint: median 111.10 ms, avg 106.50 ms, min 101.90 ms, max 111.10 ms
- warm total wall-clock: median 111.20 ms, avg 106.60 ms, min 102.00 ms, max 111.20 ms
