/** The review page's banner. The extension asks it to show a line, and waits when the line has a button. */

/** What the line is: the page draws a matching mark. A line with buttons and the info tone reads as a question. */
export type NoticeTone = "success" | "info" | "warning" | "error" | "progress";

export interface PageNoticeMessage {
  type: "host-notice";
  id: string;
  text: string;
  buttons: string[];
  hold: boolean;
  tone: NoticeTone;
  gen: number;
}

type Poster = (message: PageNoticeMessage) => boolean;

let post: Poster | null = null;
let generation = 0;
const pending = new Map<string, (value: string | undefined) => void>();

export function bindNotice(send: Poster | null): void {
  post = send;
}

export function answerNotice(message: { id?: unknown; value?: unknown }): void {
  const id = typeof message.id === "string" ? message.id : "";
  const done = pending.get(id);
  if (!done) return;
  pending.delete(id);
  done(typeof message.value === "string" && message.value ? message.value : undefined);
}

/** The page was replaced or closed, so a choice still waiting is declined. */
export function cancelNotices(): void {
  generation += 1;
  for (const [id, done] of pending) {
    pending.delete(id);
    done(undefined);
  }
}

function deliver(message: PageNoticeMessage): boolean {
  if (!post) return false;
  const gen = generation + 1;
  if (post({ ...message, gen }) === false) return false;
  generation = gen;
  return true;
}

/**
 * Shows the banner on the open review. With buttons, the promise is the button that was clicked.
 * Returns null when no review page is open, so the caller can use the editor's own message.
 */
export function offerNotice(text: string, buttons: readonly string[], tone: NoticeTone = "info"): Promise<string | undefined> | null {
  const id = buttons.length ? Math.random().toString(36).slice(2) : "";
  if (!deliver({ type: "host-notice", id, text, buttons: [...buttons], hold: buttons.length > 0, tone, gen: 0 })) return null;
  if (!buttons.length) return Promise.resolve(undefined);
  return new Promise((resolve) => pending.set(id, resolve));
}

/** A line that stays up while work is going on. The number lets the finished line replace it without being cleared. */
export function holdNotice(text: string): number | null {
  if (!deliver({ type: "host-notice", id: "", text, buttons: [], hold: true, tone: "progress", gen: 0 })) return null;
  return generation;
}

export function clearNotice(gen: number): void {
  if (gen !== generation) return;
  deliver({ type: "host-notice", id: "", text: "", buttons: [], hold: false, tone: "info", gen: 0 });
}
