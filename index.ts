/**
 * Entry point for the application.
 * */
import { execSync } from "node:child_process";
import fs from "node:fs";

if (!fs.existsSync(".env") || process.env.GROUP) {
  if (process.env.PROVIDER === "gce") {
    const resp = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/project/attributes/env",
      {
        headers: {
          "Metadata-Flavor": "Google",
        },
      },
    );
    if (resp.ok) {
      fs.writeFileSync(".env", await resp.text());
    } else {
      throw new Error("failed to download config");
    }
  }
}

if (process.env.ROLE) {
  // if role variable is set just run that script
  try {
    await import("./svc/" + process.env.ROLE + ".ts");
  } catch (e: any) {
    console.error(e);
    // Wait to avoid excessively fast restart loop if services aren't up yet
    await new Promise((resolve) => setTimeout(resolve, 500));
    process.exit(1);
  }
} else if (process.env.GROUP) {
  console.log("running group %s", process.env.GROUP);
  execSync("pm2 start ecosystem.config.js");
  setInterval(
    () => {
      execSync("pm2 flush");
    },
    12 * 60 * 60 * 1000,
  );
} else {
  console.log("starting web");
  execSync("pm2 start ecosystem.config.js --only web");
  // Start an interval to keep process running
  setInterval(
    () => {
      // execSync('pm2 flush');
    },
    12 * 60 * 60 * 1000,
  );
}
