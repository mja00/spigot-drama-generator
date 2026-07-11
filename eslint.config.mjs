import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["worker-configuration.d.ts", ".wrangler/", "node_modules/"],
    },
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // the config file itself isn't part of the tsconfig project
        files: ["**/*.mjs"],
        extends: [tseslint.configs.disableTypeChecked],
    },
    // last, so Prettier owns all formatting concerns
    prettier,
);
