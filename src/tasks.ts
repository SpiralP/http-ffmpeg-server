import AsyncLock from "async-lock";
import execa from "execa";
import ffmpegStaticPath from "ffmpeg-static";
import fs from "fs";
import { WriteStream } from "fs-capacitor";
import pump from "pump";
import { Readable } from "stream";
import tmp from "tmp";
import { shutdown as shutdownExpress } from "./express";
import { commonOptions, mp4Options, webmOptions } from "./ffmpeg";
import { sleep } from "./utils";

const isPkg =
  __dirname.startsWith("C:\\snapshot\\") || __dirname.startsWith("/snapshot/");

let ffmpegPath = ffmpegStaticPath;
let usingTmpFFmpeg = false;
export async function setup() {
  tmp.setGracefulCleanup();

  let tmpPath: string | undefined = undefined;
  if (isPkg) {
    tmpPath = tmp.tmpNameSync({
      postfix: ".exe",
    });

    await new Promise((resolve, reject) => {
      if (!tmpPath) throw "unreachable";

      pump(
        fs.createReadStream(ffmpegStaticPath),
        fs.createWriteStream(tmpPath),
        (err) => {
          if (err) {
            reject(err);
            return;
          }

          if (!tmpPath) throw "unreachable";
          console.log("ffmpeg extracted!", tmpPath);
          ffmpegPath = tmpPath;
          usingTmpFFmpeg = true;
          resolve(undefined);
        }
      );
    });
  }
}

let shuttingDown = false;
async function shutdown() {
  shuttingDown = true;
  console.log("cleaning up...");

  shutdownExpress();

  await destroyAll();

  if (usingTmpFFmpeg) {
    fs.rmSync(ffmpegPath);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);

const tasksLock = new AsyncLock();

export type Task = {
  ffmpegProcess: execa.ExecaChildProcess;
  capacitor: WriteStream;
  streamCount: number;
  destroyTimer?: NodeJS.Timeout;
};
const tasks: Record<string, Task | undefined> = {};

async function destroyTask(task: Task) {
  const { ffmpegProcess, capacitor } = task;

  if (task.destroyTimer) {
    clearTimeout(task.destroyTimer);
    task.destroyTimer = undefined;
  }
  task.streamCount = 0;

  ffmpegProcess.kill("SIGTERM", {
    forceKillAfterTimeout: 3000,
  });
  try {
    await ffmpegProcess;
  } catch {}

  capacitor.destroy();
}

async function destroyAll() {
  await Promise.all(
    Object.values(tasks).map(async (task) => {
      if (!task) return;

      await destroyTask(task);
    })
  );
}

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

async function createTask(fullPath: string, useWebm: boolean): Promise<Task> {
  console.log(`starting ffmpeg for "${fullPath}"`);

  const args: string[] = [
    ...commonOptions,
    "-i",
    fullPath,
    ...(useWebm ? webmOptions : mp4Options),
    "pipe:3",
  ];
  // console.log(`"${args.join('" "')}"`);

  const ffmpegProcess = execa(ffmpegPath, args, {
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

  const capacitor = new WriteStream();

  // @ts-ignore
  const pipe3: Readable = ffmpegProcess.stdio[3];

  pump(pipe3, capacitor, (err) => {
    if (err) {
      console.warn("ffmpeg pump", err);
      return;
    }
  });

  return {
    ffmpegProcess,
    capacitor,
    streamCount: 0,
  };
}

export async function startTask(fullPath: string, useWebm: boolean) {
  if (shuttingDown) return;

  const key = `${useWebm}${fullPath}`;
  const [ffmpegProcess] = await tasksLock.acquire(key, async () => {
    if (!tasks[key]) {
      const task = await createTask(fullPath, useWebm);
      tasks[key] = task;
    }
    return [tasks[key]!.ffmpegProcess];
  });

  await Promise.race([sleep(1000), ffmpegProcess]);
}

export async function createReadStream(fullPath: string, useWebm: boolean) {
  if (shuttingDown) return;

  const key = `${useWebm}${fullPath}`;
  return await tasksLock.acquire(key, async () => {
    const task = tasks[key];
    if (!task) return;

    task.streamCount += 1;
    if (task.destroyTimer) {
      clearTimeout(task.destroyTimer);
      task.destroyTimer = undefined;
    }
    return task.capacitor.createReadStream();
  });
}

export async function onStreamEnded(fullPath: string, useWebm: boolean) {
  if (shuttingDown) return;

  const key = `${useWebm}${fullPath}`;
  return await tasksLock.acquire(key, async () => {
    const task = tasks[key];
    if (!task) return;

    task.streamCount -= 1;
    if (task.streamCount <= 0) {
      if (task.destroyTimer) {
        clearTimeout(task.destroyTimer);
        task.destroyTimer = undefined;
      }
      task.destroyTimer = setTimeout(() => {
        removeTask(fullPath, useWebm);
      }, 60000);
    }
  });
}

async function removeTask(fullPath: string, useWebm: boolean) {
  const key = `${useWebm}${fullPath}`;
  return await tasksLock.acquire(key, () => {
    const task = tasks[key];
    if (!task) return;

    console.log(`stopping ffmpeg for "${fullPath}"`);
    destroyTask(task);

    tasks[key] = undefined;
  });
}
