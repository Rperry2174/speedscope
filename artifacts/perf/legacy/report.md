# Legacy

Current default implementation with instrumentation enabled.

Recommendation: keep-experimental

- No baseline timing was available, so this result remains experimental.

## Browser benchmark summary

# SpeedScope browser benchmark

Generated at: 2026-04-19T03:45:23.942Z

Experiment: legacy

Flags:

- deferDemangle: false
- optimizedForEachCall: false

## Fixture results

### chrome-timeline-large
- fixture: `sample/profiles/Chrome/65/timeline.json`
- format: chrome-timeline
- cold first paint: 284.20 ms
- cold total wall-clock: 284.20 ms
- warm first paint: median 221.60 ms, avg 214.00 ms, min 206.40 ms, max 221.60 ms
- warm total wall-clock: median 221.70 ms, avg 214.10 ms, min 206.50 ms, max 221.70 ms

### firefox-large
- fixture: `sample/profiles/Firefox/59/firefox.json`
- format: firefox
- cold first paint: 155.80 ms
- cold total wall-clock: 155.80 ms
- warm first paint: median 171.90 ms, avg 163.15 ms, min 154.40 ms, max 171.90 ms
- warm total wall-clock: median 171.90 ms, avg 163.15 ms, min 154.40 ms, max 171.90 ms

### instruments-random-allocations
- fixture: `sample/profiles/Instruments/16.0/simple-time-profile-deep-copy.txt`
- format: instruments-deep-copy
- cold first paint: 107.70 ms
- cold total wall-clock: 107.70 ms
- warm first paint: median 107.50 ms, avg 104.40 ms, min 101.30 ms, max 107.50 ms
- warm total wall-clock: median 107.60 ms, avg 104.45 ms, min 101.30 ms, max 107.60 ms

### stackprof-ruby-large
- fixture: `sample/profiles/stackprof/ruby-stackprof.json`
- format: stackprof
- cold first paint: 170.40 ms
- cold total wall-clock: 170.40 ms
- warm first paint: median 164.90 ms, avg 163.40 ms, min 161.90 ms, max 164.90 ms
- warm total wall-clock: median 165.00 ms, avg 163.45 ms, min 161.90 ms, max 165.00 ms

### chrome-cpuprofile-sucrase
- fixture: `sample/profiles/Chrome/65/sucrase.cpuprofile`
- format: chrome-cpu-profile
- cold first paint: 993.60 ms
- cold total wall-clock: 993.70 ms
- warm first paint: median 930.60 ms, avg 909.00 ms, min 887.40 ms, max 930.60 ms
- warm total wall-clock: median 930.70 ms, avg 909.10 ms, min 887.50 ms, max 930.70 ms

### chrome-trace-116
- fixture: `sample/profiles/Chrome/116/Trace-20230603T221323.json`
- format: chrome-trace-object
- cold first paint: 107.20 ms
- cold total wall-clock: 107.30 ms
- warm first paint: median 106.00 ms, avg 102.35 ms, min 98.70 ms, max 106.00 ms
- warm total wall-clock: median 106.00 ms, avg 102.35 ms, min 98.70 ms, max 106.00 ms


## Parity

- chrome-timeline-large: passed
- firefox-large: passed
- instruments-random-allocations: passed
- stackprof-ruby-large: passed
- chrome-cpuprofile-sucrase: passed
- chrome-trace-116: passed
