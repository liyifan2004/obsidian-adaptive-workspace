import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

/**
 * ESLint 配置。
 *
 * `eslint-plugin-obsidianmd` 是 **Obsidian 官方提供的自查工具** ——
 * 「Check your Obsidian plugin against the official developer guidelines」，
 * 商店审查用的正是它这套规则。
 *
 * ## 覆盖范围
 *
 * 用 `eslint .` 覆盖**整个仓库**，而不是只点名 `src test`。
 *
 * 只点名 `src test` 时，根目录的 `package.json` 完全游离在外 ——
 * 而官方规则里有 `validate-manifest` 与 `validate-license`，
 * 专门检查 manifest.json 与 package.json 的字段是否合法。
 * 没人检它，改坏了也不会被 CI 拦下。
 *
 * 与同 fleet 的 obsidian-folio、obsidian-jev-inbox-router、
 * obsidian-media-speed-enhancer 同一套口径。
 */
export default defineConfig([
  // 构建产物、构建期脚本与文档不是插件源码。
  //
  // main.js 是 esbuild 产物（仓库根目录同时有 main.ts 与 main.js），
  // 不忽略它会让 ESLint 去 lint 打包后的代码。
  // *.config.mjs / *.config.mts 与 version-*.mjs 是**构建期**脚本，
  // 跑在 Node 里而不是 Obsidian 里 —— 拿插件的规则去审它们只会得到假告警。
  // 它们也不进发布产物（商店只下载 main.js / manifest.json / styles.css）。
  globalIgnores([
    "node_modules",
    "main.js",
    "dist",
    ".workbuddy",
    "docs/**",
    "scripts/**",
    "*.config.mjs",
    "*.config.mts",
    "version-bump.mjs",
    "version-sync.mjs",
  ]),

  ...obsidianmd.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
  },

  {
    // 测试文件不按「插件源码」的规则审 ——
    // 商店审查看的是发布产物（main.js），测试里的 any 与断言是合理的。
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-deprecated": "off",
      "obsidianmd/no-unsupported-api": "off",
    },
  },
]);
