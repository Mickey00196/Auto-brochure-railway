"use strict";

// A popup-only extension (no background context) is only fully initialized
// by Chrome the first time something asks for it — normally the first click
// on the toolbar icon. Right after Chrome itself has just started (still
// restoring windows/tabs, extensions still registering), that first click
// can land before the popup is wired up, so it silently does nothing; a
// later click works because by then Chrome has caught up.
//
// Registering a service worker with a listener on chrome.runtime.onStartup
// gives Chrome an event to fire the moment it finishes launching, which
// forces this extension's contexts (including the action/popup) to
// initialize right then instead of waiting for that first, possibly-too-early
// click. It's a mitigation for Chrome's own startup timing, not a fix for
// anything in this extension's own code — so it isn't a guaranteed cure, but
// it's the standard remedy for this exact "first click after Chrome starts
// does nothing" symptom.
chrome.runtime.onStartup.addListener(() => {});
chrome.runtime.onInstalled.addListener(() => {});
