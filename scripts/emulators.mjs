// Starts the Firebase emulators. They need Java 21+; if JAVA_HOME is set, its java is used
// ahead of any older Java on PATH.
import { spawn } from "node:child_process";
import path from "node:path";

const env = { ...process.env };
if (env.JAVA_HOME) env.PATH = `${path.join(env.JAVA_HOME, "bin")}${path.delimiter}${env.PATH}`;
const args = ["emulators:start", "--project", "demo-erp", "--import", "emulator-data", "--export-on-exit", "emulator-data"];
const child = spawn("firebase", args, { stdio: "inherit", env, shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
