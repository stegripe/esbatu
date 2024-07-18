import { common, modules, node, stylistic, typescript, extend } from "@stegripe/eslint-config";

export default [
    ...common,
    ...modules,
    ...node,
    ...stylistic,
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
        }
    ])
];
