const DEFAULT_MONTH_WINDOW = 5;
const DEFAULT_WEEK_WINDOW = 8;
const DEFAULT_DAY_WINDOW = 14;
const DEFAULT_CHART_WIDTH = 200;
const DEFAULT_CHART_HEIGHT = 80;
const DEFAULT_CHART_MAX = 50;

const SUPPORTED_GRANULARITIES = ['month', 'week', 'day'];
const DEFAULT_GRANULARITY_ORDER = ['month', 'week', 'day'];

const parseNumericValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPathNumber = (value) => {
  return Number.parseFloat(value.toFixed(2));
};

const isValidDate = (date) => {
  return date instanceof Date && Number.isFinite(date.getTime());
};

const normalizeDate = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const getStartOfWeek = (date) => {
  const normalizedDate = normalizeDate(date);
  const dayOfWeek = normalizedDate.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;

  normalizedDate.setDate(normalizedDate.getDate() - daysSinceMonday);
  return normalizedDate;
};

const getPeriodStart = (date, granularity) => {
  const safeDate = isValidDate(date) ? date : new Date();

  if (granularity === 'week') {
    return getStartOfWeek(safeDate);
  }

  if (granularity === 'day') {
    return normalizeDate(safeDate);
  }

  return new Date(safeDate.getFullYear(), safeDate.getMonth(), 1);
};

const addPeriods = (startDate, granularity, offset) => {
  const safeOffset = Number.isFinite(offset) ? Math.trunc(offset) : 0;
  const safeDate = isValidDate(startDate) ? startDate : new Date();

  if (granularity === 'month') {
    return new Date(safeDate.getFullYear(), safeDate.getMonth() + safeOffset, 1);
  }

  const dayOffset = granularity === 'week' ? safeOffset * 7 : safeOffset;
  const shiftedDate = new Date(safeDate);
  shiftedDate.setDate(shiftedDate.getDate() + dayOffset);
  return normalizeDate(shiftedDate);
};

const getPeriodEnd = (periodStart, granularity) => {
  const nextPeriodStart = addPeriods(periodStart, granularity, 1);
  return new Date(nextPeriodStart.getTime() - 1);
};

const getPeriodLabel = (periodStart, granularity) => {
  if (granularity === 'day') {
    return periodStart.toLocaleDateString('en-US', { day: 'numeric' });
  }

  if (granularity === 'week') {
    return periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return periodStart.toLocaleDateString('en-US', { month: 'short' });
};

const getGranularityWindow = (granularity, options = {}) => {
  const windows = {
    month: options.monthWindow ?? options.windows?.month ?? DEFAULT_MONTH_WINDOW,
    week: options.weekWindow ?? options.windows?.week ?? DEFAULT_WEEK_WINDOW,
    day: options.dayWindow ?? options.windows?.day ?? DEFAULT_DAY_WINDOW
  };

  const requestedWindow = windows[granularity];
  return Number.isFinite(requestedWindow) && requestedWindow > 0
    ? Math.floor(requestedWindow)
    : (granularity === 'week' ? DEFAULT_WEEK_WINDOW : granularity === 'day' ? DEFAULT_DAY_WINDOW : DEFAULT_MONTH_WINDOW);
};

const getGranularityLabel = (granularity) => {
  if (granularity === 'week') {
    return 'weekly';
  }

  if (granularity === 'day') {
    return 'daily';
  }

  return 'monthly';
};

const getComparisonLabel = (granularity) => {
  if (granularity === 'week') {
    return 'vs last week';
  }

  if (granularity === 'day') {
    return 'vs last day';
  }

  return 'vs last month';
};

const buildTimeBuckets = ({ granularity, window, now }) => {
  const safeNow = isValidDate(now) ? now : new Date();
  const safeWindow = Number.isFinite(window) && window > 0 ? Math.floor(window) : getGranularityWindow(granularity);
  const currentPeriodStart = getPeriodStart(safeNow, granularity);
  const buckets = [];

  for (let i = safeWindow - 1; i >= 0; i -= 1) {
    const periodStart = addPeriods(currentPeriodStart, granularity, -i);
    const periodEnd = getPeriodEnd(periodStart, granularity);

    buckets.push({
      periodStart,
      periodEnd,
      label: getPeriodLabel(periodStart, granularity)
    });
  }

  return buckets;
};

const normalizeCompletedSubmissions = (data, metric) => {
  const normalizedData = Array.isArray(data) ? data : [];

  return normalizedData
    .map((submission) => {
      const uploadedAt = new Date(submission?.uploaded_at);
      const value = parseNumericValue(submission?.[metric]);

      return {
        status: submission?.status,
        uploadedAt,
        value
      };
    })
    .filter((submission) => {
      return submission.status === 'completed'
        && submission.value !== null
        && Number.isFinite(submission.uploadedAt.getTime());
    });
};

const averageForPeriod = (submissions, periodStart, periodEnd) => {
  const periodValues = submissions
    .filter((submission) => submission.uploadedAt >= periodStart && submission.uploadedAt <= periodEnd)
    .map((submission) => submission.value);

  if (periodValues.length === 0) {
    return null;
  }

  const total = periodValues.reduce((acc, value) => acc + value, 0);
  return total / periodValues.length;
};

const buildTrendDataForGranularity = (
  data = [],
  metric = 'similarity_score',
  {
    granularity = 'month',
    window,
    width = DEFAULT_CHART_WIDTH,
    height = DEFAULT_CHART_HEIGHT,
    chartMax = DEFAULT_CHART_MAX,
    now = new Date()
  } = {}
) => {
  const safeGranularity = SUPPORTED_GRANULARITIES.includes(granularity) ? granularity : 'month';
  const safeWindow = Number.isFinite(window) && window > 0 ? Math.floor(window) : getGranularityWindow(safeGranularity);
  const safeWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_CHART_WIDTH;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : DEFAULT_CHART_HEIGHT;
  const safeChartMax = Number.isFinite(chartMax) && chartMax > 0 ? chartMax : DEFAULT_CHART_MAX;
  const safeNow = isValidDate(now) ? now : new Date();

  const completedSubmissions = normalizeCompletedSubmissions(data, metric);
  const buckets = buildTimeBuckets({ granularity: safeGranularity, window: safeWindow, now: safeNow });

  const periods = buckets.map(({ periodStart, periodEnd, label }) => {
    return {
      label,
      value: averageForPeriod(completedSubmissions, periodStart, periodEnd)
    };
  });

  const denominator = Math.max(periods.length - 1, 1);
  const points = periods
    .map((period, periodIndex) => {
      if (period.value === null) {
        return null;
      }

      const clampedValue = Math.min(Math.max(period.value, 0), safeChartMax);
      const x = periods.length === 1 ? safeWidth / 2 : (periodIndex / denominator) * safeWidth;
      const y = safeHeight - (clampedValue / safeChartMax) * safeHeight;

      return {
        x,
        y,
        value: period.value,
        periodIndex
      };
    })
    .filter((point) => point !== null);

  const { linePath, areaPath } = generateTrendPaths(points, safeWidth, safeHeight);
  const validPeriods = periods.filter((period) => period.value !== null);
  const latestPeriod = validPeriods[validPeriods.length - 1] || null;
  const previousPeriod = validPeriods[validPeriods.length - 2] || null;

  const trendChange = latestPeriod && previousPeriod
    ? latestPeriod.value - previousPeriod.value
    : 0;
  const trendImproving = trendChange < 0;
  const comparisonLabel = getComparisonLabel(safeGranularity);
  const trendSummary = getTrendSummary({ trendChange, trendImproving, comparisonLabel });

  return {
    months: periods,
    points,
    linePath,
    areaPath,
    trendChange,
    trendImproving,
    trendSummary,
    plottablePoints: points.length,
    granularity: safeGranularity,
    granularityLabel: getGranularityLabel(safeGranularity),
    comparisonLabel
  };
};

export function generateTrendPaths(points = [], width = DEFAULT_CHART_WIDTH, height = DEFAULT_CHART_HEIGHT) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_CHART_WIDTH;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : DEFAULT_CHART_HEIGHT;

  const validPoints = Array.isArray(points)
    ? points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    : [];

  if (validPoints.length < 2) {
    return {
      linePath: '',
      areaPath: ''
    };
  }

  const linePath = validPoints
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${command} ${toPathNumber(point.x)} ${toPathNumber(point.y)}`;
    })
    .join(' ');

  const firstPoint = validPoints[0];
  const lastPoint = validPoints[validPoints.length - 1];
  const areaPath = `${linePath} L ${toPathNumber(lastPoint.x)} ${safeHeight} L ${toPathNumber(firstPoint.x)} ${safeHeight} Z`;

  return {
    linePath,
    areaPath
  };
}

export function generatePlaceholderTrend(width = DEFAULT_CHART_WIDTH, height = DEFAULT_CHART_HEIGHT) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_CHART_WIDTH;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : DEFAULT_CHART_HEIGHT;

  const points = [
    { x: 0, y: safeHeight * 0.75 },
    { x: safeWidth * 0.25, y: safeHeight * 0.67 },
    { x: safeWidth * 0.5, y: safeHeight * 0.58 },
    { x: safeWidth * 0.75, y: safeHeight * 0.5 },
    { x: safeWidth, y: safeHeight * 0.42 }
  ];

  return generateTrendPaths(points, safeWidth, safeHeight);
}

export function getTrendSummary({ trendChange = 0, trendImproving, comparisonLabel = 'vs last month' } = {}) {
  const parsedTrendChange = Number(trendChange);
  const safeTrendChange = Number.isFinite(parsedTrendChange) ? parsedTrendChange : 0;
  const isImproving = typeof trendImproving === 'boolean' ? trendImproving : safeTrendChange < 0;
  const safeComparisonLabel = typeof comparisonLabel === 'string' && comparisonLabel.trim()
    ? comparisonLabel.trim()
    : 'vs last month';

  if (safeTrendChange === 0) {
    return {
      text: 'Track your originality improvements over time',
      badgeText: '',
      direction: 'flat',
      tone: 'neutral',
      showBadge: false
    };
  }

  return {
    text: isImproving
      ? 'Your average similarity decreased — improving originality!'
      : 'Your average similarity increased — consider reviewing recent submissions',
    badgeText: `${Math.abs(safeTrendChange).toFixed(1)}% ${safeComparisonLabel}`,
    direction: isImproving ? 'down' : 'up',
    tone: isImproving ? 'positive' : 'negative',
    showBadge: true
  };
}

export function processMonthlyTrendData(
  data = [],
  metric = 'similarity_score',
  options = {}
) {
  return buildTrendDataForGranularity(data, metric, {
    ...options,
    granularity: 'month',
    window: options?.monthWindow ?? options?.window
  });
}

export function processAdaptiveTrendData(
  data = [],
  metric = 'similarity_score',
  options = {}
) {
  const granularityOrder = Array.isArray(options?.granularityOrder)
    ? options.granularityOrder.filter((granularity) => SUPPORTED_GRANULARITIES.includes(granularity))
    : DEFAULT_GRANULARITY_ORDER;
  const safeGranularityOrder = granularityOrder.length > 0 ? granularityOrder : DEFAULT_GRANULARITY_ORDER;

  const granularityResults = safeGranularityOrder.map((granularity) => {
    return buildTrendDataForGranularity(data, metric, {
      ...options,
      granularity,
      window: getGranularityWindow(granularity, options)
    });
  });

  const firstPlottableResult = granularityResults.find((result) => result.plottablePoints >= 2);
  const selectedResult = firstPlottableResult || granularityResults[granularityResults.length - 1];
  const usedFallbackGranularity = selectedResult.granularity !== safeGranularityOrder[0];

  return {
    ...selectedResult,
    usedFallbackGranularity,
    fallbackFromGranularity: usedFallbackGranularity ? safeGranularityOrder[0] : selectedResult.granularity
  };
}
