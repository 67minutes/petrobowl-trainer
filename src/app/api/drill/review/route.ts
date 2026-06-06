import { NextResponse } from "next/server";
import { z } from "zod";
import { reviewCard } from "@/lib/sm2";

const ReviewRequest = z.object({
  easeFactor: z.number().min(1.3).default(2.5),
  intervalDays: z.number().int().min(0).default(0),
  repetitions: z.number().int().min(0).default(0),
  rating: z.enum(["again", "hard", "good", "easy"])
});

export async function POST(request: Request) {
  const payload = ReviewRequest.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const { rating, ...state } = payload.data;
  return NextResponse.json(reviewCard(state, rating));
}
