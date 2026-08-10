import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      // The app is not running Next's React Compiler, and these compiler
      // diagnostics flag a large amount of existing client-side state sync.
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off",

      // Both of the rules below exist because the Leads CRM shipped broken in
      // two ways a linter would have caught before the browser did: a <select>
      // bound to an `agentFilter` that was never declared, and a `uniqueAgents`
      // const reading `enrichedLeads` three lines above where it was defined.
      // Because src/app/admin/page.js imports every CRM component, either one
      // takes the whole /admin route down rather than a single tab.

      // Zero violations repo-wide, and it catches the undeclared-identifier
      // case outright — worth keeping at error so it stays that way.
      "no-undef": "error",

      // Warn, not error: ~124 existing hits are the benign deferred pattern
      //     useEffect(() => { fetchThings(); }, []);
      //     const fetchThings = async () => { ... };
      // where the effect runs after render and the const is initialised by the
      // time it is called. ESLint cannot tell that apart from a genuine
      // temporal-dead-zone read during render, so erroring here would mean 124
      // false alarms and the rule being switched off again. `functions: false`
      // allows hoisted function declarations, which are always safe.
      "no-use-before-define": [
        "warn",
        { functions: false, classes: true, variables: true },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "old_table.js",
    "old_v1/**",
  ]),
]);

export default eslintConfig;
