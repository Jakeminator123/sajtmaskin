// A separate check identity prevents Preview's selective receipt from authorizing
// promotion. No AI/provider/database calls: only this workflow's direct needs.
const expected = {
  SCOPE_RESULT: "success",
  MATRIX_MODE: "full",
  RUN_MATRIX: "true",
  DISCOVER_RESULT: "success",
  REGISTRY_RESULT: "success",
  BUILD_RESULT: "success",
  ACCEPTANCE_RESULT: "success",
};
const invalid = Object.entries(expected).filter(([key, value]) => process.env[key] !== value);
if (invalid.length) {
  console.error("::error::Full master dossier matrix is not proven: " + invalid.map(([key]) => key).join(", "));
  process.exitCode = 1;
} else {
  console.log("Full master dossier matrix passed.");
}
