import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // `next lint` hat implizit nur den Anwendungscode geprüft. Beim Wechsel auf
  // die ESLint-CLI (next lint ist in Next 15 deprecated und in 16 entfernt)
  // muss dieser Geltungsbereich explizit gemacht werden — sonst laufen die
  // Regeln über das tote `archive/` und generierte Dateien.
  {
    ignores: [
      ".next/**",
      "archive/**",
      "backups/**",
      "next-env.d.ts",
      "node_modules/**",
      "public/**",
      "supabase/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Node-Skripte, keine Browser-Umgebung.
    files: ["scripts/**/*.mjs"],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
];

export default eslintConfig;
