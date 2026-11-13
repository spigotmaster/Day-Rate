/* Reminder notifications need a small reminder server (see server/README.md).
   Leave both values empty to keep notifications switched off; the calendar reminder keeps working either way.
   url: where you deployed it, e.g. 'https://day-rate-reminders.your-name.workers.dev' (no trailing slash)
   key: the PUBLIC key printed by server/generate-vapid.mjs (safe to commit; never put the private key here) */
export const PUSH = {
  url: 'https://day-rate-reminders.mstco.workers.dev',
  key: 'BMytNRXHzbbuVEfFUsgNL1MsBmAmTSV-xdKR3J7RMHaGbTHTbFs_dsdvOtO2T7DpZ4-gKUXXt-6iije2emHcrWA'
};
