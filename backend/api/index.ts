import serverless from "serverless-http";
import app from "../src/index.js";
import { connectDb } from "../src/db/index.js";

const handler = serverless(app);

export default async function(req: any, res: any) {
  await connectDb();   // cached connection
  return handler(req, res);
}