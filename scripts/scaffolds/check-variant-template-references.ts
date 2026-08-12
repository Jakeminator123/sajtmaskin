import { validateVariantTemplateReferences } from "../../src/lib/gen/scaffold-variants/variant-template-reference-integrity";

const result = validateVariantTemplateReferences(process.argv.slice(2));
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.issues.length === 0 ? 0 : 1;
