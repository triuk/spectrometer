export function quantize(value, range) {
  const step = range.step || 1;
  const maximum = range.min + Math.floor((range.max-range.min)/step)*step;
  return Math.min(maximum,Math.max(range.min,range.min + Math.round((value-range.min)/step)*step));
}
export function piecewiseSegments(range, profile) {
  if (!profile.period || profile.period <= range.step) return [];
  const segments = [];
  const maximum = range.min+Math.floor((range.max-range.min)/range.step)*range.step;
  const first = Math.floor((range.min-profile.origin)/profile.period);
  for (let index=first; index<first+10000; index++) {
    const boundary = profile.origin+(index+1)*profile.period;
    const rawStart = Math.max(range.min,profile.origin+index*profile.period);
    const start = range.min+Math.ceil((rawStart-range.min)/range.step)*range.step;
    // The end is the last supported exposure strictly below the discontinuity.
    const lastStep = Math.ceil((boundary-range.min)/range.step)-1;
    const end = Math.min(maximum,range.min+lastStep*range.step);
    if (start<=end) segments.push({index,start,end});
    if (boundary>maximum) return segments;
  }
  throw new Error('Expoziční model obsahuje příliš mnoho úseků.');
}
