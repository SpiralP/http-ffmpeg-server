import { start as startExpress } from "./express";
import { setup as setupTasks } from "./tasks";

const args = process.argv.slice(2);
const dirPath = args[0] || ".";

setupTasks();

startExpress(dirPath);
