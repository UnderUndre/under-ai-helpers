export type DisplayScale = '3' | '5' | 'continuous';

export function internalToDisplay(level_internal: number, display_scale: DisplayScale) {
  if (level_internal === undefined || level_internal === null) return null;
  const v = Math.max(0, Math.min(1, level_internal));
  if (display_scale === 'continuous') return v;
  if (display_scale === '3') {
    if (v <= 0.33) return 'beginner';
    if (v <= 0.66) return 'intermediate';
    return 'expert';
  }
  // scale 5
  if (display_scale === '5') {
    if (v <= 0.2) return 'novice';
    if (v <= 0.4) return 'beginner';
    if (v <= 0.6) return 'intermediate';
    if (v <= 0.8) return 'advanced';
    return 'expert';
  }
  return null;
}

export function displayToInternal(label: string | number, display_scale: DisplayScale): number | null {
  if (label === undefined || label === null) return null;
  if (display_scale === 'continuous') {
    const n = typeof label === 'number' ? label : parseFloat(String(label));
    if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
    return null;
  }

  const l = String(label).toLowerCase();
  if (display_scale === '3') {
    switch (l) {
      case 'beginner':
        return 0.15;
      case 'intermediate':
        return 0.5;
      case 'expert':
        return 0.85;
      default:
        return null;
    }
  }

  if (display_scale === '5') {
    switch (l) {
      case 'novice':
        return 0.1;
      case 'beginner':
        return 0.3;
      case 'intermediate':
        return 0.5;
      case 'advanced':
        return 0.7;
      case 'expert':
        return 0.9;
      default:
        return null;
    }
  }

  return null;
}
