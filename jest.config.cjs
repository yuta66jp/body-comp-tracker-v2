/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  // デフォルトは node 環境。UI 結合テスト (.integration.test.tsx) は jsdom を使う。
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // Jest 用に一部オプションを緩和
          module: "commonjs",
          moduleResolution: "node",
          paths: {
            "@/*": ["./src/*"],
          },
        },
      },
    ],
  },
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  // Next.js の server-only モジュール等をモックしてエラーを回避
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  // @testing-library/jest-dom カスタムマッチャーをグローバルに登録する
  setupFilesAfterEnv: ["@testing-library/jest-dom"],
  // ファイル単位で testEnvironment を上書きできるよう projects を使い分ける
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: {
              module: "commonjs",
              moduleResolution: "node",
              paths: { "@/*": ["./src/*"] },
            },
          },
        ],
      },
      testMatch: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "!**/*.integration.test.tsx",
      ],
      modulePathIgnorePatterns: ["<rootDir>/.next/"],
      setupFilesAfterEnv: ["@testing-library/jest-dom"],
    },
    {
      displayName: "jsdom",
      preset: "ts-jest",
      testEnvironment: "jest-environment-jsdom",
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: {
              module: "commonjs",
              moduleResolution: "node",
              paths: { "@/*": ["./src/*"] },
              jsx: "react-jsx",
            },
          },
        ],
      },
      testMatch: ["**/*.integration.test.tsx"],
      modulePathIgnorePatterns: ["<rootDir>/.next/"],
      setupFilesAfterEnv: ["@testing-library/jest-dom"],
    },
  ],
};

module.exports = config;
