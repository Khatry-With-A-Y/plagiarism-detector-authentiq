/**
 * Shared Risk Assessment Utility
 *
 * Provides standardized risk level calculation, labeling, and color coding
 * to ensure consistency across all components in the plagiarism detector.
 */

export const SCORE_INPUT_SCALES = {
  RATIO: 'ratio',
  PERCENT: 'percent'
};

export const RISK_PROFILES = {
  SUBMITTER: 'submitter',
  REVIEW: 'review'
};

export const RISK_THRESHOLD_PROFILES = {
  [RISK_PROFILES.SUBMITTER]: {
    LOW: 15,   // < 15% = Low Risk
    MEDIUM: 40 // 15-39.9% = Medium Risk, >= 40% = High Risk
  },
  [RISK_PROFILES.REVIEW]: {
    LOW: 8,    // Reviewer profile is intentionally narrower
    MEDIUM: 20
  }
};

// Backward-compatible default thresholds (submitter profile)
export const RISK_THRESHOLDS = RISK_THRESHOLD_PROFILES[RISK_PROFILES.SUBMITTER];

// Standardized color scheme for risk levels
export const RISK_COLORS = {
  low: {
    text: '#059669',      // Green text
    background: '#d1fae5', // Light green background
    chart: '#22c55e'      // Chart/graph green
  },
  medium: {
    text: '#d97706',      // Amber/yellow text
    background: '#fef3c7', // Light yellow background
    chart: '#f59e0b'      // Chart/graph yellow
  },
  high: {
    text: '#dc2626',      // Red text
    background: '#fee2e2', // Light red background
    chart: '#ef4444'      // Chart/graph red
  }
};

const DEFAULT_RISK_OPTIONS = {
  inputScale: SCORE_INPUT_SCALES.PERCENT,
  profile: RISK_PROFILES.SUBMITTER,
  useMaxLogic: false
};

const toNumberScore = (score) => {
  const parsed = Number(score);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveRiskOptions = (riskOptionsOrUseMax = {}) => {
  if (typeof riskOptionsOrUseMax === 'boolean') {
    return {
      ...DEFAULT_RISK_OPTIONS,
      useMaxLogic: riskOptionsOrUseMax
    };
  }

  if (!riskOptionsOrUseMax || typeof riskOptionsOrUseMax !== 'object') {
    return { ...DEFAULT_RISK_OPTIONS };
  }

  return {
    ...DEFAULT_RISK_OPTIONS,
    ...riskOptionsOrUseMax
  };
};

const getThresholdsForProfile = (profile) => {
  return RISK_THRESHOLD_PROFILES[profile] || RISK_THRESHOLD_PROFILES[RISK_PROFILES.SUBMITTER];
};

/**
 * Normalize score to percentage scale using an explicit input scale.
 *
 * @param {number} score - The similarity score
 * @param {'ratio'|'percent'} inputScale - Input score scale (explicit)
 * @returns {number} Score normalized to percentage scale (0-100)
 */
export function normalizeScore(score, inputScale = SCORE_INPUT_SCALES.PERCENT) {
  const parsedScore = toNumberScore(score);

  if (inputScale === SCORE_INPUT_SCALES.RATIO) {
    return parsedScore * 100;
  }

  return parsedScore;
}

/**
 * Resolve the final percentage score used for risk classification.
 *
 * @param {number} similarity - Primary similarity score
 * @param {number|null|undefined} exactMatch - Optional sentence-level score
 * @param {object|boolean} riskOptionsOrUseMax - Options object or legacy boolean useMaxLogic
 * @returns {number} Final percentage score used for threshold comparison
 */
export function resolveRiskScore(similarity, exactMatch = null, riskOptionsOrUseMax = {}) {
  const { inputScale, useMaxLogic } = resolveRiskOptions(riskOptionsOrUseMax);
  const normalizedSimilarity = normalizeScore(similarity, inputScale);
  const normalizedExactMatch = exactMatch == null
    ? null
    : normalizeScore(exactMatch, inputScale);

  if (useMaxLogic && normalizedExactMatch !== null) {
    return Math.max(normalizedSimilarity, normalizedExactMatch);
  }

  return normalizedSimilarity;
}

/**
 * Calculate risk level based on similarity scores
 *
 * Preferred call pattern:
 * `calculateRiskLevel(docScore, sentenceScore, {
 *   inputScale: SCORE_INPUT_SCALES.RATIO,
 *   useMaxLogic: true,
 *   profile: RISK_PROFILES.SUBMITTER
 * })`
 *
 * Legacy compatibility:
 * - Third argument boolean is still treated as `useMaxLogic`.
 * - Default scale is percentage when options are omitted.
 *
 * @param {number} similarity - Primary similarity score
 * @param {number|null|undefined} exactMatch - Optional sentence-level score
 * @param {object|boolean} riskOptionsOrUseMax - `{ inputScale, profile, useMaxLogic }` or legacy boolean
 * @returns {string} Risk level: 'low', 'medium', or 'high'
 */
export function calculateRiskLevel(similarity, exactMatch = null, riskOptionsOrUseMax = {}) {
  const { profile } = resolveRiskOptions(riskOptionsOrUseMax);
  const thresholds = getThresholdsForProfile(profile);
  const finalScore = resolveRiskScore(similarity, exactMatch, riskOptionsOrUseMax);

  if (finalScore < thresholds.LOW) return 'low';
  if (finalScore < thresholds.MEDIUM) return 'medium';
  return 'high';
}

/**
 * Get human-readable risk label
 *
 * @param {string} riskLevel - Risk level ('low', 'medium', 'high')
 * @returns {string} Human-readable label
 */
export function getRiskLabel(riskLevel) {
  const labels = {
    low: 'Low Risk',
    medium: 'Medium Risk',
    high: 'High Risk'
  };
  return labels[riskLevel] || 'Unknown';
}

/**
 * Get color configuration for a risk level
 *
 * @param {string} riskLevel - Risk level ('low', 'medium', 'high')
 * @returns {object} Color configuration object
 */
export function getRiskColors(riskLevel) {
  return RISK_COLORS[riskLevel] || RISK_COLORS.low;
}

/**
 * Get text color for a risk level (commonly used)
 *
 * @param {string} riskLevel - Risk level ('low', 'medium', 'high')
 * @returns {string} Hex color code for text
 */
export function getRiskTextColor(riskLevel) {
  return getRiskColors(riskLevel).text;
}

/**
 * Get chart/graph color for a risk level (commonly used)
 *
 * @param {string} riskLevel - Risk level ('low', 'medium', 'high')
 * @returns {string} Hex color code for charts
 */
export function getRiskChartColor(riskLevel) {
  return getRiskColors(riskLevel).chart;
}

/**
 * Convenience function to get both risk level and color for a score
 *
 * @param {number} similarity - Primary similarity score
 * @param {number|null} exactMatch - Optional exact match score
 * @param {object|boolean} riskOptionsOrUseMax - Risk options object or legacy boolean useMaxLogic
 * @returns {object} Object containing riskLevel, label, and colors
 */
export function assessRisk(similarity, exactMatch = null, riskOptionsOrUseMax = {}) {
  const riskLevel = calculateRiskLevel(similarity, exactMatch, riskOptionsOrUseMax);
  return {
    level: riskLevel,
    label: getRiskLabel(riskLevel),
    colors: getRiskColors(riskLevel),
    textColor: getRiskTextColor(riskLevel),
    chartColor: getRiskChartColor(riskLevel)
  };
}