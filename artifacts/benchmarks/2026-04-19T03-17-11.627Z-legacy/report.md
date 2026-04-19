# SpeedScope browser benchmark

Generated at: 2026-04-19T03:17:24.410Z

Experiment: legacy

Flags:

- deferDemangle: false
- optimizedForEachCall: false

## Fixture results

### chrome-timeline-large
- fixture: `sample/profiles/Chrome/65/timeline.json`
- format: chrome-timeline
- cold first paint: 307.60 ms
- cold total wall-clock: 307.70 ms
- warm first paint: median 207.90 ms, avg 202.25 ms, min 196.60 ms, max 207.90 ms
- warm total wall-clock: median 208.00 ms, avg 202.30 ms, min 196.60 ms, max 208.00 ms

### firefox-large
- fixture: `sample/profiles/Firefox/59/firefox.json`
- format: firefox
- cold first paint: 152.20 ms
- cold total wall-clock: 152.30 ms
- warm first paint: median 153.00 ms, avg 151.85 ms, min 150.70 ms, max 153.00 ms
- warm total wall-clock: median 153.00 ms, avg 151.90 ms, min 150.80 ms, max 153.00 ms

### instruments-random-allocations
- fixture: `sample/profiles/Instruments/16.0/simple-time-profile-deep-copy.txt`
- format: instruments-deep-copy
- cold first paint: 106.90 ms
- cold total wall-clock: 107.00 ms
- warm first paint: median 116.90 ms, avg 111.25 ms, min 105.60 ms, max 116.90 ms
- warm total wall-clock: median 117.00 ms, avg 111.30 ms, min 105.60 ms, max 117.00 ms

### stackprof-ruby-large
- fixture: `sample/profiles/stackprof/ruby-stackprof.json`
- format: stackprof
- cold first paint: 175.10 ms
- cold total wall-clock: 175.20 ms
- warm first paint: median 169.40 ms, avg 168.15 ms, min 166.90 ms, max 169.40 ms
- warm total wall-clock: median 169.50 ms, avg 168.30 ms, min 167.10 ms, max 169.50 ms

### chrome-cpuprofile-sucrase
- fixture: `sample/profiles/Chrome/65/sucrase.cpuprofile`
- format: chrome-cpu-profile
- cold first paint: 990.40 ms
- cold total wall-clock: 990.60 ms
- warm first paint: median 949.60 ms, avg 928.10 ms, min 906.60 ms, max 949.60 ms
- warm total wall-clock: median 949.70 ms, avg 928.15 ms, min 906.60 ms, max 949.70 ms

### chrome-trace-116
- fixture: `sample/profiles/Chrome/116/Trace-20230603T221323.json`
- format: chrome-trace-object
- cold first paint: 116.30 ms
- cold total wall-clock: 116.30 ms
- warm first paint: median 105.50 ms, avg 105.10 ms, min 104.70 ms, max 105.50 ms
- warm total wall-clock: median 105.50 ms, avg 105.20 ms, min 104.90 ms, max 105.50 ms
