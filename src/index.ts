import express, { NextFunction, Request, Response } from "express";
import { useDirectoryIndex } from "./directory";
import { useMedia } from "./media";

const args = process.argv.slice(2);
if (!args[0]) throw new Error("need first arg 'path'");
const dirPath = args[0];

const app = express();

// for redirecting /reencode/id -> /reencode/id/
app.set("strict routing", true);

useDirectoryIndex(app);
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

const PORT = parseInt(process.env.PORT ?? "3000");
app.listen(PORT, () =>
  console.log(`Serving ${dirPath} on http://127.0.0.1:${PORT}/`)
);
