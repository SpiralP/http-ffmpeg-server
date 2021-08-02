import { Express } from "express";
import path from "path";
import pump from "pump";
import { createReadStream, onStreamEnded, startTask } from "./tasks";
import { isFile } from "./utils";

export function useMedia(app: Express, dirPath: string) {
  app.all("/convert.mp4", async (request, response, next) => {
    const fail = () => {
      response.status(404).end();
    };
    const queryPath = request.query.path;
    if (!queryPath || typeof queryPath !== "string") {
      fail();
      return;
    }
    const safePath = path.normalize(decodeURIComponent(queryPath)).slice(1);
    if (safePath.startsWith(".") || safePath.startsWith("/")) {
      fail();
      return;
    }

    const fullPath = path.join(dirPath, safePath);
    if (!(await isFile(fullPath))) {
      fail();
      return;
    }

    console.log(`${request.method} ${fullPath}`);

    try {
      await startTask(fullPath);
    } catch {
      console.warn("failed to start ffmpeg");
      response.status(500);
      response.end();
      return;
    }

    if (request.method === "GET") {
      const readStream = await createReadStream(fullPath);
      if (!readStream) {
        console.warn!("!readStream");
        response.status(500);
        response.end();
        return;
      }

      response.type("mp4");
      pump(readStream, response, (err) => {
        onStreamEnded(fullPath);
        if (err) {
          // console.warn(err);
          response.status(500);
        }
        response.end();
      });
    } else {
      response.type("mp4");
      response.end();
    }
  });
}
