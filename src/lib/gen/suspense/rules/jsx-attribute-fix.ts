import type { SuspenseRule } from "../transform";

const ATTR_MAP: Array<[RegExp, string]> = [
  [/\bclass=/g, "className="],
  [/\bfor=/g, "htmlFor="],
  [/\bonclick=/g, "onClick="],
  [/\bonchange=/g, "onChange="],
  [/\bonsubmit=/g, "onSubmit="],
  [/\bonkeydown=/g, "onKeyDown="],
  [/\btabindex=/g, "tabIndex="],
  [/\bautocomplete=/g, "autoComplete="],
  [/\breadonly(?==)/g, "readOnly"],
];

export const jsxAttributeFix: SuspenseRule = {
  name: "jsx-attribute-fix",
  transform(line) {
    if (!line.includes("=")) return line;
    let result = line;
    for (const [pattern, replacement] of ATTR_MAP) {
      result = result.replace(pattern, replacement);
    }
    return result;
  },
};
