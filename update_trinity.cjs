const fs = require('fs');
const content = fs.readFileSync('refactor/03_quant_engine/eventMomentumFusion.ts', 'utf-8');
const newContent = content.replace(
`    const momentumSupport = bounded(1 - Math.exp(-Math.max(0, energy) / 150));
    const eventSupport = bounded(1 - Math.exp(-eventScore / 2.2));
    const statsSupport = physical.stats_available
      ? bounded(1 - Math.exp(-Math.max(0, xt * 0.32 + penetration * 1.2 + accuracy * 1.5 + corners * 0.08))) : 0;

    const minSupport = Math.min(momentumSupport, eventSupport, statsSupport);
    const maxSupport = Math.max(momentumSupport, eventSupport, statsSupport);
    const alignmentScore = bounded(1 - (maxSupport - minSupport));
    const conflict = momentumSupport >= 0.62 && (eventSupport < 0.20 || statsSupport < 0.20);
    const calibratedThreat = bounded((0.45 * momentumSupport + 0.30 * eventSupport + 0.25 * statsSupport) * (0.55 + 0.45 * alignmentScore) * (conflict ? 0.45 : 1));`,
`    const momentumSupport = bounded(1 - Math.exp(-Math.max(0, energy) / 150));
    const eventSupport = bounded(1 - Math.exp(-eventScore / 2.2));
    let statsSupport = physical.stats_available
      ? bounded(1 - Math.exp(-Math.max(0, xt * 0.32 + penetration * 1.2 + accuracy * 1.5 + corners * 0.08))) : 0;

    let minSupport, maxSupport, alignmentScore, conflict, calibratedThreat;
    if (physical.stats_available) {
      minSupport = Math.min(momentumSupport, eventSupport, statsSupport);
      maxSupport = Math.max(momentumSupport, eventSupport, statsSupport);
      alignmentScore = bounded(1 - (maxSupport - minSupport));
      conflict = momentumSupport >= 0.62 && (eventSupport < 0.20 || statsSupport < 0.20);
      calibratedThreat = bounded((0.45 * momentumSupport + 0.30 * eventSupport + 0.25 * statsSupport) * (0.55 + 0.45 * alignmentScore) * (conflict ? 0.45 : 1));
    } else {
      // Re-weight to ignore missing stats
      minSupport = Math.min(momentumSupport, eventSupport);
      maxSupport = Math.max(momentumSupport, eventSupport);
      alignmentScore = bounded(1 - (maxSupport - minSupport));
      conflict = momentumSupport >= 0.62 && eventSupport < 0.20;
      calibratedThreat = bounded((0.60 * momentumSupport + 0.40 * eventSupport) * (0.55 + 0.45 * alignmentScore) * (conflict ? 0.45 : 1));
      statsSupport = 0; // For logging
    }`
);
fs.writeFileSync('refactor/03_quant_engine/eventMomentumFusion.ts', newContent);
