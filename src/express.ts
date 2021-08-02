import express, { NextFunction, Request, Response } from "express";
import { Server } from "http";
import { useDirectoryIndex } from "./directory";
import { useMedia } from "./media";

const PORT = parseInt(process.env.PORT ?? "3000");
const app = express();

export let server: Server | undefined = undefined;

export function start(dirPath: string) {
  // for redirecting /reencode/id -> /reencode/id/
  app.set("strict routing", true);

  useDirectoryIndex(app, dirPath);
  useMedia(app, dirPath);

  // default route
  app.use((_req, res, _next) => {
    res.status(404).end();
  });

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }

    function getErrorMessage(err: string | Error) {
      if (typeof err === "string") {
        return err;
      } else {
        return err.message;
      }
    }

    console.warn(`${req.url}`, err);
    res.status(400).json({
      code: 400,
      message: getErrorMessage(err),
    });
  });

  server = app.listen(PORT, () =>
    console.log(`Serving ${dirPath} on http://127.0.0.1:${PORT}/`)
  );
}

export function shutdown() {
  if (server) {
    server.close();
    server = undefined;
  }
}
