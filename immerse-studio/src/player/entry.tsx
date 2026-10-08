import React from 'react';
import { createRoot } from 'react-dom/client';
import { Player } from './Player';
import type { Course } from '../schema/course';
import './player.css';

/**
 * Standalone player entry. Built as a single IIFE bundle
 * (public/player/immerse-player.js) that exports:
 *
 *   window.ImmersePlayer.mount(element, courseJson)
 *
 * Exported HTML and SCORM packages embed the course JSON on
 * window.IMMERSE_COURSE and call mount on load.
 */
function mount(el: HTMLElement, course: Course) {
  createRoot(el).render(<Player course={course} standalone />);
}

declare global {
  interface Window {
    IMMERSE_COURSE?: Course;
    ImmersePlayer?: { mount: typeof mount };
  }
}

if (typeof window !== 'undefined') {
  window.ImmersePlayer = { mount };
  const auto = document.getElementById('immerse-root');
  if (auto && window.IMMERSE_COURSE) mount(auto, window.IMMERSE_COURSE);
}

export { mount };
