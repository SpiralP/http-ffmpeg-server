import { Express } from "express";
import path from "path";
import pump from "pump";
import { createReadStream, onStreamEnded, startTask } from "./tasks";
import { exists } from "./utils";

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

    const ok = await startTask(fullPath);
    if (!ok) {
      response.status(500);
      response.end();
      return;
    }

    if (request.method === "GET") {
      const readStream = await createReadStream(fullPath);
      if (!readStream) {
        response.status(500);
        response.end();
        return;
      }

      await new Promise((resolve, reject) => {
        response.type("mp4");
        pump(readStream, response, (err) => {
          console.log("response pump finished");
          onStreamEnded(fullPath);
          if (err) {
            reject(err);
            return;
          }
          resolve(undefined);
        });
      });
    } else {
      response.type("mp4");
    }
    response.end();
  });
}
