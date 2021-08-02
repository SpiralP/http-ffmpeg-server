import { Express } from "express";
import path from "path";
import pump from "pump";
import { createReadStream, onStreamEnded, startTask } from "./tasks";
import { exists } from "./utils";

export function useMedia(app: Express, dirPath: string) {
  app.all("*", async (request, response) => {
    const safePath = path.normalize(decodeURIComponent(request.path)).slice(1);
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
