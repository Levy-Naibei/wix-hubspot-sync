import serverless from "serverless-http";
import app from "../src/index";

export default serverless(app);