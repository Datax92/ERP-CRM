// Runs a Next.js command against the local Firebase emulators: `node scripts/with-emulator-env.mjs dev`
import { spawn } from "node:child_process";

process.loadEnvFile(".env.emulator");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
