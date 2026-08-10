// Package policy helpers. Values are captured numerically on newer packages
// (advancePerSeat, balanceDueDays, cancellation rule days + refundPercent) but
// we fall back to parsing the legacy free-text fields so older/seed packages
// keep working.

const num = (s) => {
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

// ₹ advance collected per seat at booking.
export function advancePerSeat(pkg) {
  const v = pkg?.payment?.advancePerSeat
  if (v != null && v !== '') return Number(v) || 0
  return num(pkg?.payment?.bookingAmount) || 0
}

// Days before travel the balance is due.
export function balanceDueDays(pkg) {
  const v = pkg?.payment?.balanceDueDays
  if (v != null && v !== '') return Number(v) || 0
  return num(pkg?.payment?.balance) || 0
}

// Normalised cancellation rules: { days, refundPercent|null, full, penaltyPerPerson, timeline, penalty }.
export function cancellationRules(pkg) {
  return (pkg?.cancellation || []).map((r) => {
    const full = r.full != null ? !!r.full : /non-?refund|full/i.test(r.penalty || '')
    return {
      days: r.days != null && r.days !== '' ? Number(r.days) : (num(r.timeline) ?? 0),
      refundPercent: r.refundPercent != null && r.refundPercent !== '' ? Number(r.refundPercent) : null,
      full,
      penaltyPerPerson: r.penaltyPerPerson != null && r.penaltyPerPerson !== '' ? Number(r.penaltyPerPerson) : (full ? 0 : (num(r.penalty) ?? 0)),
      timeline: r.timeline || `${r.days ?? num(r.timeline) ?? 0} days before travel`,
      penalty: r.penalty || (r.refundPercent != null ? (Number(r.refundPercent) > 0 ? `${r.refundPercent}% refundable` : 'Non-refundable') : ''),
    }
  })
}

// The rule that applies given days-to-travel: the most-advance tier the guest still qualifies for.
export function applicableRule(rules, daysToTravel) {
  if (!rules.length || daysToTravel == null) return null
  const q = rules.filter((r) => daysToTravel >= r.days).sort((a, b) => b.days - a.days)
  return q[0] || [...rules].sort((a, b) => a.days - b.days)[0]
}

// Refund owed to the guest given the applicable rule, amount paid and pax count.
export function refundFor(rule, amountPaid = 0, pax = 1) {
  if (!rule) return 0
  if (rule.refundPercent != null) return Math.max(0, Math.round((amountPaid * rule.refundPercent) / 100))
  if (rule.full) return 0
  const penalty = (rule.penaltyPerPerson || 0) * (pax || 1)
  return Math.max(0, Math.round(amountPaid - penalty))
}
