import Promise from "bluebird";
import { Express } from "express";
import fs, { Stats } from "fs";
import path from "path";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { isDirectory } from "./utils";

export function useDirectoryIndex(app: Express, dirPath: string) {
  app.all("*", async (request, response, next) => {
    if (!request.path.endsWith("/")) {
      response.redirect(
        "/convert.mp4?path=" + encodeURIComponent(request.path)
      );
      response.end();
      return;
    }
    const fail = () => {
      response.status(404).end();
    };
    const safePath = path.normalize(decodeURIComponent(request.path)).slice(1);
    if (safePath.startsWith(".") || safePath.startsWith("/")) {
      fail();
      return;
    }

    const fullPath = path.join(dirPath, safePath);
    if (!(await isDirectory(fullPath))) {
      fail();
      return;
    }

    if (request.method !== "GET") {
      response.end();
      return;
    }

    const html = await render(fullPath);

    response.type("html");
    response.send(html);
    response.end();
  });
}

async function render(fullPath: string) {
  const names = await fs.promises.readdir(fullPath);
  const entries = Object.fromEntries(
    await Promise.map(names, async (name) => {
      let stats = undefined;
      try {
        stats = await fs.promises.stat(path.join(fullPath, name));
      } catch {}
      return [name, stats];
    })
  );

  return (
    "<!DOCTYPE html>" +
    ReactDOMServer.renderToStaticMarkup(
      <App path={fullPath} entries={entries} />
    )
  );
}

function App({
  path,
  entries,
}: {
  path: string;
  entries: Record<string, Stats | undefined>;
}) {
  return (
    <html>
      <body>
        <h1>{path}</h1>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          {Object.entries(entries).map(([name, stats]) => (
            <DirEntry key={name} name={name} stats={stats} />
          ))}
        </div>
      </body>
    </html>
  );
}

function DirEntry({ name, stats }: { name: string; stats: Stats | undefined }) {
  const slash = stats?.isDirectory() ? "/" : "";
  if (!stats) {
    return <span>{name}</span>;
  }

  return <a href={encodeURIComponent(name) + slash}>{name + slash}</a>;
}
