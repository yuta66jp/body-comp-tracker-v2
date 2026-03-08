import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
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
};

export default config;
