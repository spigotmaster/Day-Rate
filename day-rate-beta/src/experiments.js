/* Review step for finished 7-day experiments. Pure: no DOM, no storage.
   A result is identified by its start date. A decision is only ever keep, change or drop: no pass or fail. */
export const DECISIONS = ['keep', 'change', 'drop'];
export const DECISION_WORDS = { keep: 'kept', change: 'changed', drop: 'set aside' };

/* decide(list, start, choice, now) -> new list (input untouched). Unknown choices or starts leave the list as it was. */
export function decide(list, start, choice, now = Date.now()) {
  if (!Array.isArray(list) || !DECISIONS.includes(choice)) return Array.isArray(list) ? list : [];
  if (!list.some((x) => x && x.start === start)) return list;
  return list.map((x) => (x && x.start === start ? { ...x, new: false, decision: choice, decidedAt: now } : x));
}

/* The experiment to run again when someone chooses Keep: same idea, fresh start date. */
export function rerun(x, today) {
  return { id: x.id, kind: x.kind, title: x.title, text: x.text, start: today };
}

/* "Plan one social moment (3 Mar, kept)" for the Past experiments line. */
export function pastLabel(x, when) {
  return x.title + ' (' + when + (x.decision && DECISION_WORDS[x.decision] ? ', ' + DECISION_WORDS[x.decision] : '') + ')';
}
