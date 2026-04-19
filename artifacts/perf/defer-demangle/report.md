# Deferred demangle

Experimental path that defers demangling until after first render.

Recommendation: keep-experimental

- Median total wall-clock time changed by 16.70ms (9.7%).
- Representative fixture regressions detected: instruments-random-allocations (+47.60ms, +44.2%)

## Browser benchmark summary

# SpeedScope browser benchmark

Generated at: 2026-04-19T03:45:43.213Z

Experiment: defer-demangle

Flags:

- deferDemangle: true
- optimizedForEachCall: false

## Fixture results

### chrome-timeline-large
- fixture: `sample/profiles/Chrome/65/timeline.json`
- format: chrome-timeline
- cold first paint: 175.80 ms
- cold total wall-clock: 175.90 ms
- warm first paint: median 169.00 ms, avg 167.15 ms, min 165.30 ms, max 169.00 ms
- warm total wall-clock: median 169.10 ms, avg 167.20 ms, min 165.30 ms, max 169.10 ms

### firefox-large
- fixture: `sample/profiles/Firefox/59/firefox.json`
- format: firefox
- cold first paint: 139.30 ms
- cold total wall-clock: 139.40 ms
- warm first paint: median 139.90 ms, avg 136.75 ms, min 133.60 ms, max 139.90 ms
- warm total wall-clock: median 139.90 ms, avg 136.80 ms, min 133.70 ms, max 139.90 ms

### instruments-random-allocations
- fixture: `sample/profiles/Instruments/16.0/simple-time-profile-deep-copy.txt`
- format: instruments-deep-copy
- cold first paint: 168.30 ms
- cold total wall-clock: 168.40 ms
- warm first paint: median 155.00 ms, avg 136.95 ms, min 118.90 ms, max 155.00 ms
- warm total wall-clock: median 155.20 ms, avg 137.05 ms, min 118.90 ms, max 155.20 ms

### stackprof-ruby-large
- fixture: `sample/profiles/stackprof/ruby-stackprof.json`
- format: stackprof
- cold first paint: 166.20 ms
- cold total wall-clock: 166.20 ms
- warm first paint: median 148.20 ms, avg 147.75 ms, min 147.30 ms, max 148.20 ms
- warm total wall-clock: median 148.30 ms, avg 147.80 ms, min 147.30 ms, max 148.30 ms

### chrome-cpuprofile-sucrase
- fixture: `sample/profiles/Chrome/65/sucrase.cpuprofile`
- format: chrome-cpu-profile
- cold first paint: 830.70 ms
- cold total wall-clock: 830.80 ms
- warm first paint: median 813.10 ms, avg 799.00 ms, min 784.90 ms, max 813.10 ms
- warm total wall-clock: median 813.10 ms, avg 799.00 ms, min 784.90 ms, max 813.10 ms

### chrome-trace-116
- fixture: `sample/profiles/Chrome/116/Trace-20230603T221323.json`
- format: chrome-trace-object
- cold first paint: 99.10 ms
- cold total wall-clock: 99.20 ms
- warm first paint: median 97.80 ms, avg 95.75 ms, min 93.70 ms, max 97.80 ms
- warm total wall-clock: median 97.90 ms, avg 95.80 ms, min 93.70 ms, max 97.90 ms


## Parity

- chrome-timeline-large: passed
- firefox-large: passed
- instruments-random-allocations: passed
- stackprof-ruby-large: passed
- chrome-cpuprofile-sucrase: passed
- chrome-trace-116: passed
