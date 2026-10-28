// Dedicated Chart Data Generator for Real-Time Performance & Projected Growth Metrics
export function generateChartData(inv, timeframe = '30d') {
  const principal = Number(inv?.total || 1000);
  let curVal = Number(
    inv?.totalCurrentValue != null
      ? inv.totalCurrentValue
      : (inv?.total_current_value != null ? inv.total_current_value : (principal > 0 ? principal * 2 : 2000))
  );
  if (curVal <= principal && principal > 0) curVal = principal * 2;
  const bonus = Number(inv?.bonus != null ? inv.bonus : principal);
  const roi = Number(inv?.roi_percent || inv?.roiPercent || 70);
  const planName = inv?.planName || inv?.plan_name || inv?.plan_label || inv?.portfolio || 'Tesla · Explorer';

  const now = Date.now();
  let pointsCount = 30;
  let stepMs = 86400000; // 1 day
  let tf = (timeframe || '30d').toLowerCase();

  if (tf === '24h') {
    pointsCount = 24;
    stepMs = 3600000; // 1 hour
  } else if (tf === '7d') {
    pointsCount = 7;
    stepMs = 86400000;
  } else if (tf === '30d') {
    pointsCount = 30;
    stepMs = 86400000;
  } else if (tf === '90d') {
    pointsCount = 30;
    stepMs = 3 * 86400000;
  } else if (tf === '1y') {
    pointsCount = 52;
    stepMs = 7 * 86400000;
  } else if (tf === 'all') {
    pointsCount = 40;
    stepMs = 2 * 86400000;
  }

  // 65% historical, 35% projected compound trajectory
  const histCount = Math.max(3, Math.floor(pointsCount * 0.65));
  const projCount = Math.max(3, pointsCount - histCount);

  const points = [];
  const startTs = now - (histCount * stepMs);

  // Initial base valuation before market drift & bonus allocation
  const baseStart = principal;
  for (let i = 0; i <= histCount; i++) {
    const t = startTs + (i * stepMs);
    const progress = i / histCount;
    // S-curve compounding progress with subtle realistic market micro-fluctuations
    const smoothFactor = Math.pow(progress, 1.18);
    const microJitter = (Math.sin(i * 1.85) * 0.007) + (Math.cos(i * 2.9) * 0.004);
    const pointVal = i === histCount
      ? curVal
      : Math.max(principal, Number((baseStart + (curVal - baseStart) * smoothFactor * (1 + microJitter)).toFixed(2)));

    const d = new Date(t);
    const label = tf === '24h'
      ? d.getHours().toString().padStart(2, '0') + ':00'
      : (d.getMonth() + 1) + '/' + d.getDate();

    points.push({
      date: label,
      fullDate: d.toISOString().split('T')[0],
      timestamp: t,
      value: pointVal,
      projected: pointVal,
      isProjection: false
    });
  }

  // Future Projected Growth points extending smoothly from current value
  const dailyRoiRate = (roi / 100) / 30; // daily compound interest rate based on plan
  let runningProj = curVal;
  for (let j = 1; j <= projCount; j++) {
    const t = now + (j * stepMs);
    const daysFromNow = (j * stepMs) / 86400000;
    // Compound projected growth curve
    runningProj = Number((curVal * Math.pow(1 + dailyRoiRate, daysFromNow)).toFixed(2));
    const d = new Date(t);
    const label = tf === '24h'
      ? '+' + j + 'h'
      : (d.getMonth() + 1) + '/' + d.getDate();

    points.push({
      date: label,
      fullDate: d.toISOString().split('T')[0],
      timestamp: t,
      value: null, // no historical value for projection
      projected: runningProj,
      isProjection: true
    });
  }

  const gainLoss = Number((curVal - principal).toFixed(2));
  const gainPct = principal > 0 ? Number(((gainLoss / principal) * 100).toFixed(2)) : 0;
  const projectedEndVal = points[points.length - 1]?.projected || Number((curVal * (1 + roi / 100)).toFixed(2));
  const projectedGain = Number((projectedEndVal - curVal).toFixed(2));

  return {
    investmentId: inv?.id || 'sim_inv_1',
    planName,
    principal,
    bonus,
    currentValue: curVal,
    roi,
    timeframe: tf,
    summary: {
      startValue: principal,
      currentValue: curVal,
      gainLoss,
      gainPct,
      isGain: gainLoss >= 0,
      bonusMatch: bonus,
      projectedEndValue: projectedEndVal,
      projectedGain,
      projectedRoiPct: roi,
      dailyRate: Number((dailyRoiRate * 100).toFixed(2))
    },
    points
  };
}

export default generateChartData;
