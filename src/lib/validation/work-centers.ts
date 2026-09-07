/** Work centers (docs/M1_SPEC.md §6.2). */
import { z } from "zod";
import { optionalCheckbox, optionalText, text } from "./common";

export const workCenterSchema = z.object({
  code: text("Code", { max: 32 }),
  name: text("Name", { max: 120 }),
  description: optionalText("Description", { max: 500, multiline: true }),
  isActive: optionalCheckbox(),
});

export type WorkCenterInput = z.infer<typeof workCenterSchema>;
