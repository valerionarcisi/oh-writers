import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const candidate of [
  resolve(process.cwd(), "apps/web/.env"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
  resolve(process.cwd(), "../../apps/web/.env"),
]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}
