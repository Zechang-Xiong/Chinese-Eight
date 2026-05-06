import "./styles/app.css";
import { EightBallApp } from "./ui/EightBallApp";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("App root not found.");

const app = new EightBallApp(root);
void app.launch();
