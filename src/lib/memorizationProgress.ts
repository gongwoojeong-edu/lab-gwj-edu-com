// ============================================================
// memorizationProgress — sentence_progress mem_* 저장·pass 판정
// ============================================================
import {
  fetchSentenceProgress,
  upsertSentenceProgress,
  type SentenceProgressRow,
} from "@/integrations/supabase/storage";
import type { MemDirection } from "@/lib/memorizationText";

export type MemStep = "listen" | "scramble" | "cloze";

export interface MemProgressFlags {
  mem_listen_done: boolean;
  mem_scramble_done: boolean;
  mem_cloze_done: boolean;
  mem_speech_done: boolean;
  mem_record_done: boolean;
  mem_ko_to_en_done: boolean;
  mem_en_to_ko_done: boolean;
  mem_passed_at: string | null;
  mem_attempt_count: number;
}

export const emptyMemFlags = (): MemProgressFlags => ({
  mem_listen_done: false,
  mem_scramble_done: false,
  mem_cloze_done: false,
  mem_speech_done: false,
  mem_record_done: false,
  mem_ko_to_en_done: false,
  mem_en_to_ko_done: false,
  mem_passed_at: null,
  mem_attempt_count: 0,
});

export function memFlagsFromProgress(row: SentenceProgressRow | null): MemProgressFlags {
  const r = row as SentenceProgressRow & Partial<MemProgressFlags>;
  return {
    mem_listen_done: r?.mem_listen_done ?? false,
    mem_scramble_done: r?.mem_scramble_done ?? false,
    mem_cloze_done: r?.mem_cloze_done ?? false,
    mem_speech_done: r?.mem_speech_done ?? false,
    mem_record_done: r?.mem_record_done ?? false,
    mem_ko_to_en_done: r?.mem_ko_to_en_done ?? false,
    mem_en_to_ko_done: r?.mem_en_to_ko_done ?? false,
    mem_passed_at: r?.mem_passed_at ?? null,
    mem_attempt_count: r?.mem_attempt_count ?? 0,
  };
}

const P0_STEPS: MemStep[] = ["listen", "scramble", "cloze"];

export function isMemStepDone(flags: MemProgressFlags, step: MemStep): boolean {
  if (step === "listen") return flags.mem_listen_done;
  if (step === "scramble") return flags.mem_scramble_done;
  return flags.mem_cloze_done;
}

export function firstIncompleteMemStep(flags: MemProgressFlags): MemStep {
  for (const s of P0_STEPS) {
    if (!isMemStepDone(flags, s)) return s;
  }
  return "cloze";
}

export function allP0MemStepsDone(flags: MemProgressFlags): boolean {
  return P0_STEPS.every((s) => isMemStepDone(flags, s));
}

export function directionTrackDone(flags: MemProgressFlags, direction: MemDirection): boolean {
  if (direction === "ko_to_en") return flags.mem_ko_to_en_done;
  return flags.mem_en_to_ko_done;
}

function applyDirectionPass(flags: MemProgressFlags, direction: MemDirection): MemProgressFlags {
  const next = { ...flags };
  if (direction === "ko_to_en") next.mem_ko_to_en_done = true;
  else next.mem_en_to_ko_done = true;
  if (allP0MemStepsDone(next)) {
    next.mem_passed_at = new Date().toISOString();
  }
  return next;
}

export async function markMemStepDone(
  sentenceId: string,
  step: MemStep,
  direction: MemDirection = "ko_to_en",
): Promise<MemProgressFlags> {
  const existing = await fetchSentenceProgress(sentenceId);
  const flags = memFlagsFromProgress(existing);
  const patch: Record<string, unknown> = {
    mem_attempt_count: flags.mem_attempt_count + 1,
    mem_direction: direction,
    touchActivity: true,
  };
  if (step === "listen") patch.mem_listen_done = true;
  if (step === "scramble") patch.mem_scramble_done = true;
  if (step === "cloze") patch.mem_cloze_done = true;

  const merged = {
    ...flags,
    ...patch,
    mem_attempt_count: flags.mem_attempt_count + 1,
  } as MemProgressFlags;

  if (step === "cloze" && allP0MemStepsDone(merged)) {
    const withDir = applyDirectionPass(merged, direction);
    patch.mem_ko_to_en_done = withDir.mem_ko_to_en_done;
    patch.mem_en_to_ko_done = withDir.mem_en_to_ko_done;
    patch.mem_passed_at = withDir.mem_passed_at;
  }

  await upsertSentenceProgress(sentenceId, patch as Partial<SentenceProgressRow>);
  const updated = await fetchSentenceProgress(sentenceId);
  return memFlagsFromProgress(updated);
}
