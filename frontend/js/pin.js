/**
 * CycleGuard — PIN Authentication Bridge
 * Bridges legacy PIN calls to the unified Authentication Module.
 */

import {
  initAuth,
  openAuthSheet,
  closeAuthSheet,
  switchView,
} from './auth.js';

export function initPin() {
  initAuth();
}

export function openPinSheet(action) {
  openAuthSheet(action);
}

export function closePinSheet() {
  closeAuthSheet();
}

export function switchToPinView() {
  switchView('PIN_REQUIRED');
}
