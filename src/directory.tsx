import { Express } from "express";
import fs from "fs";
import React from "react";
import ReactDOMServer from "react-dom/server";

export function useDirectoryIndex(app: Express, dirPath: string) {
  app.get("/", async (request, response) => {
    const filenames = await fs.promises.readdir(dirPath);

    response.type("html");
    response.send(
      "<!DOCTYPE html>" +
        ReactDOMServer.renderToStaticMarkup(
          <App path={request.path} filenames={filenames} />
        )
    );
  });
}

function App({ path, filenames }: { path: string; filenames: string[] }) {
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
          {filenames.map((name) => (
            <a key={name} href={encodeURIComponent(name)}>
              {name}
            </a>
          ))}
        </div>
      </body>
    </html>
  );
}
