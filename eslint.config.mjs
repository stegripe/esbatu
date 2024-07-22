import { common, modules, node, prettier, typescript, extend, ignores } from "@stegripe/eslint-config";
import eslintPluginPrettier from "eslint-plugin-prettier";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
    ...common,
    ...modules,
    ...node,
    ...prettier,
    ...extend(typescript, [
        {
            rule: "typescript/naming-convention",
            option: [
                "error",
                {
                    selector: "default",
                    format: ["camelCase", "PascalCase", "snake_case", "UPPER_CASE"],
                    leadingUnderscore: "allow",
                    trailingUnderscore: "forbid"
                },
                {
                    selector: "variable",
                    modifiers: ["destructured"],
                    format: null
                }
            ]
        },
        {
            rule: "typescript/consistent-type-definitions",
            option: ["off"]
        },
        {
            rule: "typescript/no-unsafe-declaration-merging",
            option: ["off"]
        },
        {
            rule: "typescript/no-non-null-assertion",
            option: ["off"]
        }
    ]),
    ...ignores,
    {
        plugins: {
            prettier: eslintPluginPrettier
        }
    }
];
