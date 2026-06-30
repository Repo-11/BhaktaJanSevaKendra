/*
 * Digital Seva Kendra — progressive enhancement (Task 7)
 *
 * This script is enhancement-only. The static HTML + CSS already render every
 * piece of content fully visible and operable. Nothing here is required for the
 * page to work; it only *adds* motion (when GSAP is present and motion is
 * allowed) and reveals a map fallback (when the embedded map fails).
 *
 * Resilience rules (per design "Graceful Degradation Strategy" / "Error Handling"):
 *   - Each independent init runs inside its own try/catch so one failing init
 *     cannot break another, and a thrown error never leaves the page broken.
 *   - Failures are logged to the console only — never surfaced to the visitor.
 *   - The pre-animation hidden state ("animate-in" + "motion-ready") is applied
 *     ONLY after confirming GSAP loaded and motion is allowed, so content is
 *     never stuck hidden.
 *
 * Requirements: 3.5, 6.6, 7.1, 7.2, 7.3, 7.4, 8.1, 8.3, 8.4, 8.5
 */
(function () {
  'use strict';

  // Selectors for the primary page sections that receive entrance animations.
  var PRIMARY_SECTION_SELECTORS = [
    'header.hero',
    'section.services',
    'section.map-section',
    'footer.site-footer'
  ];

  /**
   * Determine whether the visitor prefers reduced motion.
   *
   * Safe default: if matchMedia is unavailable (very old browsers), treat that
   * as "reduced motion / no animation" so we never attempt to hide content we
   * cannot animate back into view. (Requirement 8.4, Error Handling.)
   *
   * @returns {boolean} true when motion should be suppressed.
   */
  function prefersReducedMotion() {
    if (typeof window.matchMedia === 'undefined') {
      return true;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  }

  /**
   * Collect the primary section elements that exist in the DOM.
   * @returns {Element[]}
   */
  function getPrimarySections() {
    var sections = [];
    for (var i = 0; i < PRIMARY_SECTION_SELECTORS.length; i++) {
      var el = document.querySelector(PRIMARY_SECTION_SELECTORS[i]);
      if (el) {
        sections.push(el);
      }
    }
    return sections;
  }

  /**
   * initAnimations — apply subtle, one-time entrance animations.
   *
   * Only proceeds when BOTH:
   *   - GSAP and ScrollTrigger are actually loaded (feature detection), AND
   *   - the visitor has NOT requested reduced motion.
   *
   * When it proceeds it adds the "motion-ready" class to <html> (which lets the
   * scoped CSS rule `html.motion-ready .animate-in { opacity: 0 }` take effect),
   * tags the animated elements with "animate-in", then tweens each section from
   * opacity 0 / y:24 to opacity 1 / y:0 exactly once via ScrollTrigger.
   *
   * If it does NOT proceed it does nothing at all — "motion-ready" is never
   * added, so the CSS hidden state never applies and all content stays visible
   * at rest. (Requirements 7.3, 8.2.)
   */
  function initAnimations() {
    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;

    // Feature-detect GSAP. ScrollTrigger may live on window or be reachable via
    // gsap.registerPlugin; require gsap plus a usable ScrollTrigger.
    var hasGsap = typeof gsap !== 'undefined' && gsap !== null;
    var hasScrollTrigger =
      typeof ScrollTrigger !== 'undefined' && ScrollTrigger !== null;

    if (!hasGsap || !hasScrollTrigger) {
      // GSAP/ScrollTrigger missing → leave content fully visible. (Req 7.3, 6.6)
      return;
    }

    if (prefersReducedMotion()) {
      // Reduced motion → present everything in its final, visible state. (Req 8.2)
      return;
    }

    var sections = getPrimarySections();
    if (sections.length === 0) {
      return;
    }

    // Now (and only now) opt into the pre-animation hidden state.
    document.documentElement.classList.add('motion-ready');
    for (var i = 0; i < sections.length; i++) {
      sections[i].classList.add('animate-in');
    }

    // Tag service items too so the services list can stagger in.
    var serviceItems = document.querySelectorAll('li.service-item');
    for (var s = 0; s < serviceItems.length; s++) {
      serviceItems[s].classList.add('animate-in');
    }

    gsap.registerPlugin(ScrollTrigger);

    // One-time entrance tween per primary section: fade + small rise.
    // duration 0.6s (≤ 1000ms, Req 8.3); y shift 24px (≤ 50px, Req 8.1);
    // once: true + toggleActions play-none-none-none → animates EXACTLY once
    // and never replays. (Req 8.5)
    sections.forEach(function (section) {
      var isServices = section.matches('section.services');

      gsap.fromTo(
        section,
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: 'power2.out',
          overwrite: 'auto',
          scrollTrigger: {
            trigger: section,
            start: 'top 85%',
            toggleActions: 'play none none none',
            once: true
          }
        }
      );

      // Stagger the individual service items as the services section enters.
      // Stagger spread is kept small (≤ 600ms): 9 gaps * 0.05s = 0.45s spread,
      // each item's own tween is 0.4s. Subtle, one-time, never replays.
      if (isServices) {
        var items = section.querySelectorAll('li.service-item');
        if (items.length > 0) {
          gsap.fromTo(
            items,
            { opacity: 0, y: 16 },
            {
              opacity: 1,
              y: 0,
              duration: 0.4,
              ease: 'power2.out',
              overwrite: 'auto',
              stagger: { each: 0.05, from: 'start' },
              scrollTrigger: {
                trigger: section,
                start: 'top 85%',
                toggleActions: 'play none none none',
                once: true
              }
            }
          );
        }
      }
    });
  }

  /**
   * initMapFallback — reveal the static address + Directions fallback when the
   * embedded Google Maps iframe fails or never loads.
   *
   * Two best-effort triggers (per design "best-effort" note):
   *   1. The iframe's `error` event.
   *   2. A ~5s load timeout (cleared on a successful `load`).
   *
   * Cross-origin iframes often fire `load` even for error pages, so both
   * triggers are used as belt-and-suspenders. The fallback markup already
   * exists in the DOM; we only toggle its visibility classes. (Req 3.5, 7.4)
   */
  function initMapFallback() {
    var frame = document.getElementById('map-frame');
    var fallback = document.getElementById('map-fallback');

    if (!frame || !fallback) {
      return;
    }

    var revealed = false;

    function revealFallback() {
      if (revealed) {
        return;
      }
      revealed = true;
      fallback.classList.add('is-visible');
      frame.classList.add('is-hidden');
    }

    // Reveal on an explicit load error.
    frame.addEventListener('error', revealFallback);

    // Reveal if the iframe has not finished loading within 5 seconds.
    var timeoutId = window.setTimeout(revealFallback, 5000);

    // A successful load clears the timeout so the fallback is not shown.
    frame.addEventListener('load', function () {
      window.clearTimeout(timeoutId);
    });
  }

  /**
   * Run an init function inside its own guard so a failure in one enhancement
   * cannot break another or the page. Logs to console only. (Error Handling.)
   * @param {string} name
   * @param {Function} fn
   */
  function runGuarded(name, fn) {
    try {
      fn();
    } catch (err) {
      // Silent, non-fatal: enhancement failures never produce visible error UI.
      if (window.console && typeof window.console.error === 'function') {
        window.console.error('[Digital Seva Kendra] ' + name + ' failed:', err);
      }
    }
  }

  function init() {
    runGuarded('initAnimations', initAnimations);
    runGuarded('initMapFallback', initMapFallback);
  }

  // Run after the DOM is parsed. The script is loaded with `defer`, so the DOM
  // is typically already available, but guard for both states.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
