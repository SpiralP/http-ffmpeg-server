import AsyncLock from "async-lock";
import { ChildProcess, spawn } from "child_process";
import { Express } from "express";
import ffmpeg from "ffmpeg-static";
import { WriteStream } from "fs-capacitor";
import path from "path";
import pump from "pump";
import { Readable } from "stream";
import tmp from "tmp-promise";
import { commonOptions } from "./ffmpeg";
import { exists, sleep } from "./utils";

const tasksLock = new AsyncLock();

const tasks: Record<
  string,
  {
    ffmpegProcess: ChildProcess;
    capacitor: WriteStream;
    pump_promise: Promise<undefined>;
  }
> = {};

tmp.setGracefulCleanup();

function shutdown() {
  console.log("shutting down...");

  Object.values(tasks).forEach(({ ffmpegProcess, capacitor }) => {
    ffmpegProcess.kill();
    capacitor.destroy();
  });

  // Any sync or async graceful shutdown procedures can be run before exiting…
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);

export function useMedia(app: Express, dirPath: string) {
  app.all("*", async (request, response) => {
    const safePath = path.normalize(request.path).slice(1);
    if (safePath.startsWith(".") || safePath.startsWith("/")) {
      response.status(404);
      response.end();
      return;
    }

    const fullPath = path.join(dirPath, safePath);
    if (!(await exists(fullPath))) {
      response.status(404);
      response.end();
      return;
    }

    console.log(`${request.method} ${fullPath}`);

    const capacitor = await tasksLock.acquire(fullPath, async () => {
      if (!tasks[fullPath]) {
        const task = await startTask(fullPath);
        if (!task) {
          return;
        }
        tasks[fullPath] = task;
      }

      return tasks[fullPath].capacitor;
    });
    if (!capacitor) {
      response.status(500);
      response.end();
      return;
    }

    response.type("mp4");

    if (request.method === "GET") {
      const readStream = capacitor.createReadStream();

      await new Promise((resolve, reject) => {
        pump(readStream, response, (err) => {
          console.log("pump finished");
          if (err) {
            reject(err);
            return;
          }
          resolve(undefined);
        });
      });
    }
    response.end();
  });
}

async function startTask(inputPath: string) {
  console.log(`starting new ffmpeg for ${inputPath}`);

  const args: string[] = [
    ...commonOptions,
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart+frag_keyframe+empty_moov",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-vf",
    `subtitles=${inputPath}`,
    "-f",
    "mp4",
    "pipe:3",
  ];

  const ffmpegProcess = spawn(ffmpeg, args, {
    // cwd: this.dir.path,
    stdio: [
      /* Standard: stdin, stdout, stderr */
      "ignore",
      "inherit",
      "inherit",
      // pipe:3 output
      "pipe",
    ],
  });

  const exit_promise = new Promise((resolve) => {
    ffmpegProcess.once("exit", () => {
      resolve(undefined);
    });
  });

  const exited = await Promise.race<Promise<boolean>>([
    exit_promise.then(() => true),
    sleep(1000).then(() => false),
  ]);
  if (exited) {
    return undefined;
  }

  const capacitor = new WriteStream();

  // @ts-ignore
  const pipe3: Readable = ffmpegProcess.stdio[3];
  const pump_promise = new Promise<undefined>((resolve, reject) => {
    pump(pipe3, capacitor, (err) => {
      console.log("pump finished");
      ffmpegProcess.kill();

      if (err) {
        reject(err);
        return;
      }
      resolve(undefined);
    });
  });

  return {
    ffmpegProcess,
    capacitor,
    pump_promise,
  };
}
