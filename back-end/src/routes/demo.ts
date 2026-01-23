import express from "express";
import fs from "node:fs";
import path from "node:path";

export const demoRouter = express.Router();
const listingsPath = path.resolve(process.cwd(), "data", "listings.json");

demoRouter.get("/listings", (_req, res) => {
  res.json(JSON.parse(fs.readFileSync(listingsPath, "utf-8")));
});

demoRouter.get("/listings/:id", (req, res) => {
  const listings = JSON.parse(fs.readFileSync(listingsPath, "utf-8")) as any[];
  const found = listings.find(l => l.id === req.params.id);
  if (!found) return res.status(404).json({ error: "Not found" });
  res.json(found);
});
