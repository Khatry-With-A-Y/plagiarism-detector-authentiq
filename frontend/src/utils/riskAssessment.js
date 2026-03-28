/**
 * Shared Risk Assessment Utility
 *
 * Provides standardized risk level calculation, labeling, and color coding
 * to ensure consistency across all components in the plagiarism detector.
 */

// Standardized risk thresholds (percentage scale)
export const RISK_THRESHOLDS = {
  LOW: 15,    // < 15% = Low Risk
  MEDIUM: 40  // 15-39.9% = Medium Risk, >= 40% = High Risk
};

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

/**
 * Normalize similarity score to percentage scale
 * Handles both decimal (0-1) and percentage (0-100) inputs
 *
 * @param {number} score - The similarity score
 * @returns {number} Score normalized to percentage scale (0-100)
 */
export function normalizeScore(score) {
  return score <= 1 ? score * 100 : score;
}

/**
 * Calculate risk level based on similarity scores
 *
 * @param {number} similarity - Primary similarity score (decimal or percentage)
 * @param {number|null} exactMatch - Optional exact match score (decimal or percentage)
 * @param {boolean} useMaxLogic - Whether to use max of similarity and exactMatch
 * @returns {string} Risk level: 'low', 'medium', or 'high'
 */
export function calculateRiskLevel(similarity, exactMatch = null, useMaxLogic = false) {
  // Convert scores to percentage scale if needed
  const normalizedSimilarity = normalizeScore(similarity);
  const normalizedExactMatch = exactMatch !== null ? normalizeScore(exactMatch) : null;

  // Determine final score based on logic preference
  const finalScore = useMaxLogic && normalizedExactMatch !== null
    ? Math.max(normalizedSimilarity, normalizedExactMatch)
    : normalizedSimilarity;

  // Apply standardized thresholds
  if (finalScore < RISK_THRESHOLDS.LOW) return 'low';
  if (finalScore < RISK_THRESHOLDS.MEDIUM) return 'medium';
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
 * @param {boolean} useMaxLogic - Whether to use max logic
 * @returns {object} Object containing riskLevel, label, and colors
 */
export function assessRisk(similarity, exactMatch = null, useMaxLogic = false) {
  const riskLevel = calculateRiskLevel(similarity, exactMatch, useMaxLogic);
  return {
    level: riskLevel,
    label: getRiskLabel(riskLevel),
    colors: getRiskColors(riskLevel),
    textColor: getRiskTextColor(riskLevel),
    chartColor: getRiskChartColor(riskLevel)
  };
}