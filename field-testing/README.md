# Field Testing

This directory holds artifacts and protocols for on-site field testing of
the HMEAYC system.

## Purpose

- Validate hardware (IMU sensors, camera, audio) in real classroom environments.
- Verify end-to-end pipeline: IMU ingestion → analysis → report generation.
- Collect edge-case data (occlusions, noise, multi-child scenarios).
- Document configuration and findings per session.

## Session Protocol Template

```markdown
# Field Test Session — YYYY-MM-DD

**Location:** <school / classroom>
**Attendees:** <list>
**Hardware:** <sensor S/Ns, camera model>
**Duration:** <start – end>

### Objectives
- <goal 1>
- <goal 2>

### Setup Notes
<wiring, mounting, lighting conditions>

### Observations
<issues, anomalies, qualitative notes>

### Data Collected
- IMU logs: <paths>
- Video clips: <paths>
- Audio: <paths>

### Action Items
- [ ] <item>
```

Create one markdown file per session using the template above.
