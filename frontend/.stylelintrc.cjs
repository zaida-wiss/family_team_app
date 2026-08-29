// Rapporterande läge (2026-08-29, Sprint 10 S2 — se ADR-0036). Ingen
// baskonfiguration (t.ex. stylelint-config-standard) — den skulle flagga
// dussintals orelaterade stilfrågor över hela kodbasen på en gång. Bara
// no-descending-specificity, den regel som mekaniskt förhindrar den
// återkommande buggklassen från 2026-08-12 (en override senare i filen
// förlorar tyst mot en tidigare regel med samma specificitet).
module.exports = {
  rules: {
    "no-descending-specificity": true
  }
};
