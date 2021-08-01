import AsyncLock from "async-lock";
import { ChildProcess, spawn } from "child_process";
import ffmpeg from "ffmpeg-static";
import { WriteStream } from "fs-capacitor";
import pump from "pump";
import { Readable } from "stream";
import { commonOptions } from "./ffmpeg";
import { sleep } from "./utils";

const tasksLock = new AsyncLock();

export type Task = {
  ffmpegProcess: ChildProcess;
  capacitor: WriteStream;
  pump_promise: Promise<undefined>;
  streamCount: number;
  destroyTimer?: NodeJS.Timeout;
};
const tasks: Record<string, Task | undefined> = {};

export function destroyAll() {
  Object.values(tasks).forEach((task) => {
    if (!task) return;
    const { ffmpegProcess, capacitor } = task;
    ffmpegProcess.kill();
    capacitor.destroy();
  });
}

function shutdown() {
  console.log("shutting down...");

  destroyAll();

  // Any sync or async graceful shutdown procedures can be run before exiting…
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);

function escapeFilter(s: string) {
  // https://ffmpeg.org/ffmpeg-filters.html#Notes-on-filtergraph-escaping
  return s
    .replace(/\\/g, "\\\\\\\\")
    .replace(/\'/g, "\\\\\\'")
    .replace(/\:/g, "\\\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\,/g, "\\,")
    .replace(/\;/g, "\\;");
}

async function createTask(fullPath: string): Promise<Task | undefined> {
  console.log(`starting new ffmpeg for ${fullPath}`);

  const args: string[] = [
    ...commonOptions,
    "-i",
    fullPath,
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
    `subtitles=filename=${escapeFilter(fullPath)}`,
    "-f",
    "mp4",
    "pipe:3",
  ];
  console.log(args.join('" "'));

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
      console.log("ffmpeg pump finished");
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
    streamCount: 0,
  };
}

export async function startTask(fullPath: string) {
  return await tasksLock.acquire(fullPath, async () => {
    if (!tasks[fullPath]) {
      const task = await createTask(fullPath);
      if (!task) {
        return false;
      }
      tasks[fullPath] = task;
    }

    return true;
  });
}

export async function createReadStream(fullPath: string) {
  return await tasksLock.acquire(fullPath, async () => {
    const task = tasks[fullPath];
    if (!task) return;

    task.streamCount += 1;
    if (task.destroyTimer) {
      clearTimeout(task.destroyTimer);
      task.destroyTimer = undefined;
    }
    return task.capacitor.createReadStream();
  });
}

export async function onStreamEnded(fullPath: string) {
  return await tasksLock.acquire(fullPath, async () => {
    const task = tasks[fullPath];
    if (!task) return;

    task.streamCount -= 1;
    if (task.streamCount === 0) {
      if (task.destroyTimer) {
        clearTimeout(task.destroyTimer);
        task.destroyTimer = undefined;
      }
      task.destroyTimer = setTimeout(() => {
        destroy(fullPath);
      }, 10000);
    }
  });
}

async function destroy(fullPath: string) {
  return await tasksLock.acquire(fullPath, () => {
    const task = tasks[fullPath];
    if (!task) return;

    console.log(`stopping ffmpeg for ${fullPath}`);

    task.ffmpegProcess.kill();
    task.capacitor.destroy();
    task.streamCount = 0;
    if (task.destroyTimer) {
      clearTimeout(task.destroyTimer);
      task.destroyTimer = undefined;
    }
    tasks[fullPath] = undefined;
  });
}
