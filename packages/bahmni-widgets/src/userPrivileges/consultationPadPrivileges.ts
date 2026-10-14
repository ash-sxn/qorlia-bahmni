/**
 * Privilege configuration for consultation pad controls
 * Each privilege key maps to an array of required OpenMRS privilege names
 * This array-based structure allows multiple privileges per feature and easy extensibility
 */
export const CONSULTATION_PAD_PRIVILEGES = {
  ADD_VISITS: ['Add Visits'],
  ENCOUNTER: ['Add Encounters'],
  ALLERGIES: ['Add Allergies'],
  EDIT_ALLERGIES: ['Edit Allergies'],
  EDIT_OBSERVATIONS: ['Edit Observations'],
  // The pinned FHIR diagnosis DAO accepts either privilege. Conditions use a
  // separate DAO requiring Edit Conditions; do not treat these as equivalent.
  CONDITIONS_AND_DIAGNOSES: ['Add Diagnoses', 'Edit Diagnoses'],
  CONDITIONS: ['Edit Conditions'],
  INVESTIGATIONS: ['Add Orders'],
  MEDICATIONS: ['Add Orders'],
  OBSERVATIONS: ['Add Observations'],
  VACCINATIONS: ['Add Orders'],
};
