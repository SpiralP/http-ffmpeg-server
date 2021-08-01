import { Express } from "express";

export function useDirectoryIndex(app: Express) {
  app.get("/", async (request, response) => {
    // TODO maybe react server side rendering
    response.send(`<html><body><h1>hi</h1></body></html>`);
  });
}
