/**
 * Canonical questionnaire scales — single source of truth so the participant
 * questionnaire and the reports never drift apart.
 *
 * RATING_LABELS: the 0–4 rating scale, ordered ascending by value. Each entry
 * has masculine/feminine label variants (the item's grammatical gender decides
 * which the questionnaire/report shows: rating_masc_5 vs rating_fem_5).
 *
 * YES_LABEL / NO_LABEL: display text for binary_yes_no answers (stored as the
 * values "yes"/"no").
 *
 * Colors are intentionally NOT defined here: the questionnaire renders
 * translucent pills on a dark background while the reports render solid colors
 * on white, so each owns its own palette.
 */

export const RATING_LABELS = [
  { value: 0, labelM: "Insatisfactorio", labelF: "Insatisfactoria" },
  { value: 1, labelM: "Regular", labelF: "Regular" },
  { value: 2, labelM: "Bueno", labelF: "Buena" },
  { value: 3, labelM: "Muy Bueno", labelF: "Muy Buena" },
  { value: 4, labelM: "Excelente", labelF: "Excelente" },
];

export const YES_LABEL = "Sí";
export const NO_LABEL = "No";
