import { spawn } from "child_process";
import { Express } from "express";
import ffmpeg from "ffmpeg-static";
import { promises as fs } from "fs";
import path from "path";

export function useMedia(app: Express, dirPath: string) {
  app.get("*", async (request, response) => {
    const safePath = path.normalize(request.path).slice(1);
    if (safePath.startsWith(".") || safePath.startsWith("/")) {
      response.status(404);
      response.end();
      return;
    }

    const fullPath = path.join(dirPath, safePath);
    if (await access(fullPath)) {
      console.log(`${fullPath}`);
    } else {
      response.status(404);
    }
    response.end();
  });
}

function convert() {
  const args: string[] = [];
  const ffmpegProcess = spawn(ffmpeg, args, {
    // cwd: this.dir.path,
    stdio: [
      /* Standard: stdin, stdout, stderr */
      "inherit",
      "inherit",
      "inherit",
      // pipe:3 video input
      "pipe",
      // pipe:4 audio input
      "pipe",
    ],
  });
}

async function access(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
