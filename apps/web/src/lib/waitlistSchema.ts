import { z } from "zod";

export const SOURCES = ["landing", "pricing-free", "pricing-pro", "pricing-agency"] as const;

export const waitlistSchema = z.object({
  email: z
    .string({ required_error: "Enter your email." })
    .trim()
    .toLowerCase()
    .min(1, "Enter your email.")
    .max(254, "That email is too long.")
    .email("That doesn't look like an email address."),
  source: z.enum(SOURCES).catch("landing"),
  // Honeypot: real users never see or fill this field.
  company: z.string().max(0).optional().or(z.literal("")),
});

export type WaitlistState =
  | { status: "idle" }
  | { status: "ok"; message: string; at: number }
  | { status: "duplicate"; message: string; at: number }
  | { status: "error"; message: string; field?: "email"; at: number };
