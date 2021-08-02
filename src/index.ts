import { start as startExpress } from "./express";
import { setup as setupTasks } from "./tasks";

const port = parseInt(process.env.PORT || "3000");
// whether to default links on directory to webm
const useWebm = Boolean(process.env.USE_WEBM);

const args = process.argv.slice(2);
const dirPath = args[0] || ".";

setupTasks();

startExpress(port, dirPath, useWebm);
