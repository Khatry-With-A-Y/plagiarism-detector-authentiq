import React from 'react';

/**
 * Local avatar primitive: renders a flex-centered circle containing up to
 * two initials derived from `name`. No external network request is made —
 * this replaces the previous dependency on
 * https://ui-avatars.com/api/?name=..., which occasionally failed for a
 * single account (cached failure / ad-block rule / transient 429) and
 * produced the browser's broken-image icon.
 *
 * Initials are derived the same way `ui-avatars.com` does:
 *   - Multi-word name  → first letter of the first two words ("John Doe" → "JD").
 *   - Single-word name → first two characters ("bishnu" → "BI",
 *                                              "User"   → "US",
 *                                              "admin"  → "AD").
 *   - Single character → that one letter.
 *   - Empty / non-string → "U".
 *
 * Sizing and cursor are normally inherited from the host class (e.g.
 * `dashboard-avatar`, `ustats-avatar`, `usermgmt-avatar`). The component
 * only sets inline styles that those classes don't already define
 * (background colour, text colour, centering, font), so the existing CSS
 * keeps controlling layout.
 */
function getInitials(name) {
  if (typeof name !== 'string') return 'U';
  const trimmed = name.trim();
  if (!trimmed) return 'U';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }

  const word = parts[0];
  return word.length >= 2
    ? word.substring(0, 2).toUpperCase()
    : word.charAt(0).toUpperCase();
}

export default function Avatar({
  name,
  className = '',
  background = '#1e40af',
  color = '#ffffff',
  onClick,
  alt,
}) {
  const initials = getInitials(name);

  const style = {
    backgroundColor: background,
    color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    fontWeight: 600,
    fontSize: '0.85em',
    lineHeight: 1,
    letterSpacing: '0.02em',
    userSelect: 'none',
    flexShrink: 0,
    overflow: 'hidden',
    textTransform: 'uppercase',
  };

  return (
    <div
      className={className}
      onClick={onClick}
      style={style}
      role="img"
      aria-label={alt || (name ? `${name} avatar` : 'User avatar')}
    >
      {initials}
    </div>
  );
}
