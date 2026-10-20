/*
 * Purpose: Identify unbuilt local runs; Deploy stamps this with the checked-out SHA.
 * Consumers: debug reports through safety.js.
 * Dependencies: browser window; Deploy workflow replaces this file before publishing.
 */
window.WaitingGameBuild = { commit: "development" };
