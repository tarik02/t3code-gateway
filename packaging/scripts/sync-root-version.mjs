import { readFile, writeFile } from "node:fs/promises";

const rootPackagePath = new URL("../../package.json", import.meta.url);
const sourcePackagePath = new URL("../../packages/contracts/package.json", import.meta.url);

const rootPackageJson = JSON.parse(await readFile(rootPackagePath, "utf8"));
const sourcePackageJson = JSON.parse(await readFile(sourcePackagePath, "utf8"));

rootPackageJson.version = sourcePackageJson.version;

await writeFile(rootPackagePath, `${JSON.stringify(rootPackageJson, null, 2)}\n`);
