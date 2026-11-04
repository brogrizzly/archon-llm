import { GetArchonPublicStatusResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

const publicStatus = {
  availability: "unavailable",
  publicUseApproved: false,
  releaseVersion: "0.1.0-alpha.1",
  codename: "Halloween",
  releaseStatus: "planned-release-candidate",
  firstTarget: "iPhone 14 Plus",
  modelDirection: "Direct UTF-8 byte language model",
  checkpoint: null,
  textFormat: {
    codecId: "archon-utf8-bytes-v1",
    status: "planned-not-bound-to-checkpoint",
    description:
      "Strict UTF-8 bytes; the codec is not yet bound to an evaluated release checkpoint.",
  },
  blockers: [
    "No versioned release checkpoint with a published checksum.",
    "Runtime and codec versions are not pinned to a release checkpoint.",
    "Quality, safety, and iPhone 14 Plus evaluations are not documented for a release model.",
    "Public use has not been approved.",
  ],
} as const;

router.get("/archon/status", (_req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  res.json(GetArchonPublicStatusResponse.parse(publicStatus));
});

export default router;
