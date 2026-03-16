import { Router, Request, Response } from 'express';

const homeRoute = Router();

homeRoute.get("/", (_req: Request, res: Response) => {
  res.json({
    service: "Wix-HubSpot Integration API",
    status: "running",
  });
});

export default homeRoute;