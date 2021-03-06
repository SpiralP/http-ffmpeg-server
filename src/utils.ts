import fs from "fs";

export async function exists(path: string) {
  return await new Promise<boolean>((resolve) => {
    fs.access(path, fs.constants.F_OK, (err) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export async function isFile(path: string) {
  return await new Promise<boolean>((resolve) => {
    fs.stat(path, (err, stats) => {
      if (err) {
        resolve(false);
      } else {
        resolve(stats.isFile());
      }
    });
  });
}

export async function isDirectory(path: string) {
  return await new Promise<boolean>((resolve) => {
    fs.stat(path, (err, stats) => {
      if (err) {
        resolve(false);
      } else {
        resolve(stats.isDirectory());
      }
    });
  });
}

export async function sleep(n: number) {
  await new Promise((resolve) => setTimeout(resolve, n));
}
