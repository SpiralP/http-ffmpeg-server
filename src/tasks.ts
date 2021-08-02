import AsyncLock from "async-lock";
import execa from "execa";
import ffmpegStaticPath from "ffmpeg-static";
import fs from "fs";
import { WriteStream } from "fs-capacitor";
import pump from "pump";
import { Readable } from "stream";
import tmp from "tmp";
import { shutdown as shutdownExpress } from "./express";
import { commonOptions } from "./ffmpeg";
import { sleep } from "./utils";

const isPkg =
  __dirname.startsWith("C:\\snapshot\\") || __dirname.startsWith("/snapshot/");

let ffmpegPath = ffmpegStaticPath;
let usingTmpFFmpeg = false;
export function setup() {
  tmp.setGracefulCleanup();

  let tmpPath: string | undefined = undefined;
  if (isPkg) {
    tmpPath = tmp.tmpNameSync({
      postfix: ".exe",
    });

    pump(
      fs.createReadStream(ffmpegStaticPath),
      fs.createWriteStream(tmpPath),
      (err) => {
        if (err) throw err;
        console.log("ffmpeg extracted!", tmpPath);
        if (tmpPath) {
          ffmpegPath = tmpPath;
          usingTmpFFmpeg = true;
        }
      }
    );
  }
}

async function shutdown() {
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

export async function destroyAll() {
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

async function createTask(fullPath: string): Promise<Task> {
  console.log(`starting ffmpeg for "${fullPath}"`);

  const args: string[] = [
    ...commonOptions,
    "-i",
    fullPath,
    // remove chapter info
    "-map_chapters",
    "-1",
    "-map_metadata",
    "-1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart+frag_keyframe+empty_moov",
    // quality
    "-crf",
    "20",
    "-c:a",
    "aac",
    // "-vf",
    // `subtitles=filename=${escapeFilter(fullPath)}`,
    "-f",
    "mp4",
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

export async function startTask(fullPath: string) {
  const [ffmpegProcess] = await tasksLock.acquire(fullPath, async () => {
    if (!tasks[fullPath]) {
      const task = await createTask(fullPath);
      tasks[fullPath] = task;
    }
    return [tasks[fullPath]!.ffmpegProcess];
  });

  await Promise.race([sleep(1000), ffmpegProcess]);
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
    if (task.streamCount <= 0) {
      if (task.destroyTimer) {
        clearTimeout(task.destroyTimer);
        task.destroyTimer = undefined;
      }
      task.destroyTimer = setTimeout(() => {
        removeTask(fullPath);
      }, 10000);
    }
  });
}

async function removeTask(fullPath: string) {
  return await tasksLock.acquire(fullPath, () => {
    const task = tasks[fullPath];
    if (!task) return;

    console.log(`stopping ffmpeg for "${fullPath}"`);
    destroyTask(task);

    tasks[fullPath] = undefined;
  });
}
