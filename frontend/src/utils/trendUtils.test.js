import { generatePlaceholderTrend } from './trendUtils';

describe('generatePlaceholderTrend', () => {
  it('returns non-empty line and area paths for default dimensions', () => {
    const placeholder = generatePlaceholderTrend();

    expect(placeholder.linePath).toMatch(/^M\s/);
    expect(placeholder.linePath).toContain(' L ');
    expect(placeholder.areaPath).toContain(placeholder.linePath);
    expect(placeholder.areaPath.endsWith(' Z')).toBe(true);
  });

  it('uses provided chart dimensions when building placeholder paths', () => {
    const placeholder = generatePlaceholderTrend(300, 120);

    expect(placeholder.linePath).toContain('L 300 50.4');
    expect(placeholder.areaPath).toContain('L 300 120');
  });
});