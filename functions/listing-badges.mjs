const badges = {
  stage1: /\bstage\s*[-–]?\s*1\b/i,
  stage2: /\bstage\s*[-–]?\s*2\b/i,
  suspension: /\b(?:gewindefahrwerk|coilovers?)\b/i,
  exhaust: /\b(?:sportabgasanlage|abgasanlage|sportauspuff|cat[- ]?back)\b/i,
};

export function listingBadges(listing) {
  if (Array.isArray(listing.tuningBadges)) {
    return Object.keys(badges).filter(key => listing.tuningBadges.includes(key));
  }
  // Only derive from the seller's explicit tuning statement or model suffix.
  const text = [listing.modelExtension, listing.modificationNotes].filter(Boolean).join(' ');
  return Object.entries(badges).filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
}
