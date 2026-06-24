/**
 * Deterministic env resolution for DB read/dump scripts.
 *
 * dotenv's `config({ path })` does NOT overwrite variables that are already
 * present on `process.env`. For a tool whose entire purpose is choosing
 * **which database** to read (dev vs the pulled production snapshot), that is a
 * silent footgun: if the parent process already exported `POSTGRES_URL`
 * (common when the backoffice/Streamlit host inherits a shell env), the
 * `--env=<file>` the operator picked would be ignored for the connection
 * string and the script would read the wrong database.
 *
 * `mergeEnvFileOverProcess` makes the **selected env file win**: values parsed
 * from the chosen dotenv file override the inherited process env, while keys
 * absent from the file fall back to the process env. Pure + side-effect free so
 * the precedence is unit-testable without touching a real database.
 *
 * @param {Record<string, string | undefined>} [parsed] - keys parsed from the
 *   selected dotenv file (e.g. `config({ path }).parsed`).
 * @param {Record<string, string | undefined>} [base] - the inherited env
 *   (defaults to `process.env`).
 * @returns {Record<string, string | undefined>} merged env where file wins.
 */
export function mergeEnvFileOverProcess(parsed = {}, base = process.env) {
  return { ...base, ...parsed };
}
