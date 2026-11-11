import { seedSyntheticAnswerKey } from "../src/db/seedAnswerKey.ts";
import { seedDemoFollowUpLoop } from "../src/db/seedDemoLoop.ts";
import { setupSeeded } from "./helpers.ts";
import type { TrackerListResponse } from "@nirmala/shared";

/** Setup + snapshot Awal + kunci jawaban sintetis. */
export async function setupPhase6() {
  const env = await setupSeeded();
  await seedSyntheticAnswerKey(env.database);
  const json = async <T>(response: Response) => (await response.json()) as T;
  const getJson = async <T>(path: string, cookie?: string) => {
    const response = await env.get(path, cookie);
    return { status: response.status, body: await response.json() as T, response };
  };
  /** Loop demo: konfirmasi item ter-flag -> terbit CHR -> impor Revisi (catatan jadi perlu_verifikasi). */
  const runLoop = () => seedDemoFollowUpLoop(env.database);
  const trackerNotes = async (cookie: string, query = "") => (await json<TrackerListResponse>(await env.get(`/api/tracker/notes?cycleId=${env.cycleId}&pageSize=100${query}`, cookie)));
  return { ...env, json, getJson, runLoop, trackerNotes };
}
export type Phase6Env = Awaited<ReturnType<typeof setupPhase6>>;
