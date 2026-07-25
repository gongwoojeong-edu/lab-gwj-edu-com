// ============================================================
// memorizationProgress — sentence_progress mem_* 저장·pass 판정
// ============================================================
import {
  fetchSentenceProgress,
  upsertSentenceProgress,
  type SentenceProgressRow,
} from "@/integrations/supabase/storage";
import type { MemDirection } from "@/lib/memorizationText";
import type { MemDirectionSetting } from "@/lib/fetchMemSettings";

export type MemStep =
  | "listen"
  | "scramble"
  | "cloze"
  | "dictation"
  | "interpret"
  | "translate"
  | "speech"
  | "record";

export interface MemProgressFlags {
  mem_listen_done: boolean;
  mem_scramble_done: boolean;
  mem_cloze_done: boolean;
  mem_dictation_done: boolean;
  mem_interpret_done: boolean;
  mem_translate_done: boolean;
  mem_speech_done: boolean;
  mem_record_done: boolean;
  mem_ko_to_en_done: boolean;
  mem_en_to_ko_done: boolean;
  mem_passed_at: string | null;
  mem_attempt_count: number;
  mem_direction: string | null;
  mem_dictation_score: number | null;
  mem_interpret_score: number | null;
  mem_translate_score: number | null;
}

export interface MemStepOptions {
  requireRecord: boolean;
  requireInterpret: boolean;
  requireTranslate: boolean;
}

export const emptyMemFlags = (): MemProgressFlags => ({
  mem_listen_done: false,
  mem_scramble_done: false,
  mem_cloze_done: false,
  mem_dictation_done: false,
  mem_interpret_done: false,
  mem_translate_done: false,
  mem_speech_done: false,
  mem_record_done: false,
  mem_ko_to_en_done: false,
  mem_en_to_ko_done: false,
  mem_passed_at: null,
  mem_attempt_count: 0,
  mem_direction: null,
  mem_dictation_score: null,
  mem_interpret_score: null,
  mem_translate_score: null,
});

export function memFlagsFromProgress(row: SentenceProgressRow | null): MemProgressFlags {
  const r = row as SentenceProgressRow & Partial<MemProgressFlags>;
  return {
    mem_listen_done: r?.mem_listen_done ?? false,
    mem_scramble_done: r?.mem_scramble_done ?? false,
    mem_cloze_done: r?.mem_cloze_done ?? false,
    mem_dictation_done: r?.mem_dictation_done ?? false,
    mem_interpret_done: r?.mem_interpret_done ?? false,
    mem_translate_done: r?.mem_translate_done ?? false,
    mem_speech_done: r?.mem_speech_done ?? false,
    mem_record_done: r?.mem_record_done ?? false,
    mem_ko_to_en_done: r?.mem_ko_to_en_done ?? false,
    mem_en_to_ko_done: r?.mem_en_to_ko_done ?? false,
    mem_passed_at: r?.mem_passed_at ?? null,
    mem_attempt_count: r?.mem_attempt_count ?? 0,
    mem_direction: r?.mem_direction ?? null,
    mem_dictation_score: r?.mem_dictation_score ?? null,
    mem_interpret_score: r?.mem_interpret_score ?? null,
    mem_translate_score: r?.mem_translate_score ?? null,
  };
}

export function requiredMemSteps(opts: MemStepOptions): MemStep[] {
  const steps: MemStep[] = ["listen", "scramble", "cloze", "dictation"];
  if (opts.requireInterpret) steps.push("interpret");
  if (opts.requireTranslate) steps.push("translate");
  steps.push("speech");
  if (opts.requireRecord) steps.push("record");
  return steps;
}

export function isMemStepDone(flags: MemProgressFlags, step: MemStep): boolean {
  if (step === "listen") return flags.mem_listen_done;
  if (step === "scramble") return flags.mem_scramble_done;
  if (step === "cloze") return flags.mem_cloze_done;
  if (step === "dictation") return flags.mem_dictation_done;
  if (step === "interpret") return flags.mem_interpret_done;
  if (step === "translate") return flags.mem_translate_done;
  if (step === "speech") return flags.mem_speech_done;
  return flags.mem_record_done;
}

export function firstIncompleteMemStep(
  flags: MemProgressFlags,
  opts: MemStepOptions,
): MemStep {
  for (const s of requiredMemSteps(opts)) {
    if (!isMemStepDone(flags, s)) return s;
  }
  return "speech";
}

export function allRequiredMemStepsDone(
  flags: MemProgressFlags,
  opts: MemStepOptions,
): boolean {
  return requiredMemSteps(opts).every((s) => isMemStepDone(flags, s));
}

const stepPatch = (step: MemStep): Partial<MemProgressFlags> => {
  if (step === "listen") return { mem_listen_done: true };
  if (step === "scramble") return { mem_scramble_done: true };
  if (step === "cloze") return { mem_cloze_done: true };
  if (step === "dictation") return { mem_dictation_done: true };
  if (step === "interpret") return { mem_interpret_done: true };
  if (step === "translate") return { mem_translate_done: true };
  if (step === "speech") return { mem_speech_done: true };
  return { mem_record_done: true };
};

const resetStepFlags = (): Partial<MemProgressFlags> => ({
  mem_listen_done: false,
  mem_scramble_done: false,
  mem_cloze_done: false,
  mem_dictation_done: false,
  mem_interpret_done: false,
  mem_translate_done: false,
  mem_speech_done: false,
  mem_record_done: false,
});

function trackComplete(
  flags: MemProgressFlags,
  activeDirection: MemDirection,
  directionSetting: MemDirectionSetting,
): Partial<MemProgressFlags> {
  if (directionSetting === "both" && activeDirection === "ko_to_en") {
    return {
      mem_ko_to_en_done: true,
      ...resetStepFlags(),
      mem_direction: "en_to_ko",
    };
  }
  const out: Partial<MemProgressFlags> = {
    mem_passed_at: new Date().toISOString(),
  };
  if (activeDirection === "ko_to_en") out.mem_ko_to_en_done = true;
  else out.mem_en_to_ko_done = true;
  if (directionSetting === "both") {
    out.mem_ko_to_en_done = true;
    out.mem_en_to_ko_done = true;
  }
  return out;
}

export async function markMemStepDone(
  sentenceId: string,
  step: MemStep,
  opts: {
    activeDirection: MemDirection;
    directionSetting: MemDirectionSetting;
    stepOptions: MemStepOptions;
    dictationScore?: number;
    interpretScore?: number;
    translateScore?: number;
    assignmentId?: string | null;
  },
): Promise<MemProgressFlags & { advancedToSecondTrack?: boolean }> {
  const aid = opts.assignmentId ?? null;
  const existing = await fetchSentenceProgress(sentenceId, aid);
  const flags = memFlagsFromProgress(existing);
  const patch: Record<string, unknown> = {
    mem_attempt_count: flags.mem_attempt_count + 1,
    mem_direction: opts.activeDirection,
    touchActivity: true,
    ...stepPatch(step),
  };

  if (step === "dictation" && opts.dictationScore != null) {
    patch.mem_dictation_score = opts.dictationScore;
  }
  if (step === "interpret" && opts.interpretScore != null) {
    patch.mem_interpret_score = opts.interpretScore;
  }
  if (step === "translate" && opts.translateScore != null) {
    patch.mem_translate_score = opts.translateScore;
  }

  const merged = { ...flags, ...patch } as MemProgressFlags;
  let advancedToSecondTrack = false;

  const required = requiredMemSteps(opts.stepOptions);
  const isFinalStep = required[required.length - 1] === step;

  if (isFinalStep && allRequiredMemStepsDone(merged, opts.stepOptions)) {
    const trackPatch = trackComplete(merged, opts.activeDirection, opts.directionSetting);
    Object.assign(patch, trackPatch);
    advancedToSecondTrack =
      opts.directionSetting === "both" &&
      opts.activeDirection === "ko_to_en" &&
      !flags.mem_ko_to_en_done;
  }

  await upsertSentenceProgress(sentenceId, { assignmentId: aid, ...(patch as Partial<SentenceProgressRow>) });
  const updated = await fetchSentenceProgress(sentenceId, aid);
  return { ...memFlagsFromProgress(updated), advancedToSecondTrack };
}

export async function resetMemProgressForRetry(
  sentenceId: string,
  assignmentId?: string | null,
): Promise<void> {
  await upsertSentenceProgress(sentenceId, {
    assignmentId: assignmentId ?? null,
    ...resetStepFlags(),
    mem_ko_to_en_done: false,
    mem_en_to_ko_done: false,
    mem_passed_at: null,
    mem_attempt_count: 0,
    mem_direction: null,
    mem_dictation_score: null,
    mem_interpret_score: null,
    mem_translate_score: null,
    touchActivity: true,
  } as Partial<SentenceProgressRow> & { assignmentId?: string | null });
}
