# Optimized forEachCall

Experimental path using the prefix-based forEachCall traversal.

Recommendation: keep-experimental

- Median total wall-clock time changed by 5.80ms (3.4%).
- Candidate was not materially faster than baseline.

## Browser benchmark summary

# SpeedScope browser benchmark

Generated at: 2026-04-19T03:45:33.331Z

Experiment: optimized-for-each-call

Flags:

- deferDemangle: false
- optimizedForEachCall: true

## Fixture results

### chrome-timeline-large
- fixture: `sample/profiles/Chrome/65/timeline.json`
- format: chrome-timeline
- cold first paint: 174.70 ms
- cold total wall-clock: 174.80 ms
- warm first paint: median 169.50 ms, avg 167.30 ms, min 165.10 ms, max 169.50 ms
- warm total wall-clock: median 169.60 ms, avg 167.40 ms, min 165.20 ms, max 169.60 ms

### firefox-large
- fixture: `sample/profiles/Firefox/59/firefox.json`
- format: firefox
- cold first paint: 140.30 ms
- cold total wall-clock: 140.30 ms
- warm first paint: median 134.30 ms, avg 132.85 ms, min 131.40 ms, max 134.30 ms
- warm total wall-clock: median 134.40 ms, avg 132.90 ms, min 131.40 ms, max 134.40 ms

### instruments-random-allocations
- fixture: `sample/profiles/Instruments/16.0/simple-time-profile-deep-copy.txt`
- format: instruments-deep-copy
- cold first paint: 94.60 ms
- cold total wall-clock: 94.60 ms
- warm first paint: median 94.30 ms, avg 92.60 ms, min 90.90 ms, max 94.30 ms
- warm total wall-clock: median 94.50 ms, avg 92.70 ms, min 90.90 ms, max 94.50 ms

### stackprof-ruby-large
- fixture: `sample/profiles/stackprof/ruby-stackprof.json`
- format: stackprof
- cold first paint: 197.70 ms
- cold total wall-clock: 197.80 ms
- warm first paint: median 166.00 ms, avg 158.50 ms, min 151.00 ms, max 166.00 ms
- warm total wall-clock: median 166.10 ms, avg 158.55 ms, min 151.00 ms, max 166.10 ms

### chrome-cpuprofile-sucrase
- fixture: `sample/profiles/Chrome/65/sucrase.cpuprofile`
- format: chrome-cpu-profile
- cold first paint: 844.70 ms
- cold total wall-clock: 844.70 ms
- warm first paint: median 818.60 ms, avg 813.35 ms, min 808.10 ms, max 818.60 ms
- warm total wall-clock: median 818.60 ms, avg 813.35 ms, min 808.10 ms, max 818.60 ms

### chrome-trace-116
- fixture: `sample/profiles/Chrome/116/Trace-20230603T221323.json`
- format: chrome-trace-object
- cold first paint: 97.70 ms
- cold total wall-clock: 97.70 ms
- warm first paint: median 99.70 ms, avg 99.50 ms, min 99.30 ms, max 99.70 ms
- warm total wall-clock: median 99.80 ms, avg 99.55 ms, min 99.30 ms, max 99.80 ms


## Parity

- chrome-timeline-large: passed
- firefox-large: passed
- instruments-random-allocations: passed
- stackprof-ruby-large: passed
- chrome-cpuprofile-sucrase: passed
- chrome-trace-116: passed
