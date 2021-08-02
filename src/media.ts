import { Express, Request, Response } from "express";
import path from "path";
import pump from "pump";
import { createReadStream, onStreamEnded, startTask } from "./tasks";
import { isFile } from "./utils";

export function useMedia(app: Express, dirPath: string) {
  const handle = async (
    request: Request,
    response: Response,
    useWebm: boolean
  ) => {
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
      await startTask(fullPath, useWebm);
    } catch {
      console.warn("failed to start ffmpeg");
      onStreamEnded(fullPath, useWebm);
      response.status(500);
      response.end();
      return;
    }

    response.type(useWebm ? "webm" : "mp4");
    // response.header("Content-Length", `${1024 * 1024 * 1024}`);

    if (request.method === "GET") {
      const readStream = await createReadStream(fullPath, useWebm);
      if (!readStream) {
        console.warn!("!readStream");
        response.status(500);
        response.end();
        return;
      }

      pump(readStream, response, (err) => {
        onStreamEnded(fullPath, useWebm);
        if (err) {
          // console.warn(err);
          response.status(500);
        }
        response.end();
      });
    } else {
      response.end();
    }
  };

  app.all(
    "/convert.mp4",
    async (request, response) => await handle(request, response, false)
  );
  app.all(
    "/convert.webm",
    async (request, response) => await handle(request, response, true)
  );
}
