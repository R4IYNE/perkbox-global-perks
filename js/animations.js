/**
 * Perkbox Global Perks — Animations
 *
 * Provides animateValue (count-up with easeOutExpo)
 * and initScrollReveal (IntersectionObserver-based reveal).
 */

(function (global) {
  'use strict';

  function easeOutExpo(t) {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function animateValue(element, from, to, duration, formatter) {
    if (!element) return;
    var fmt = formatter || function (v) { return String(Math.round(v)); };
    if (element._animRaf) {
      cancelAnimationFrame(element._animRaf);
      element._animRaf = null;
    }
    var start = null;
    function tick(timestamp) {
      if (!start) start = timestamp;
      var elapsed = timestamp - start;
      var t = Math.min(elapsed / duration, 1);
      var current = from + (to - from) * easeOutExpo(t);
      element.textContent = fmt(current);
      if (t < 1) {
        element._animRaf = requestAnimationFrame(tick);
      } else {
        element.textContent = fmt(to);
        element._animRaf = null;
      }
    }
    element._animRaf = requestAnimationFrame(tick);
  }

  function initScrollReveal() {
    var targets = document.querySelectorAll('.reveal-up:not(.revealed)');
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('revealed'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.10, rootMargin: '0px 0px -32px 0px' });
    targets.forEach(function (el) { observer.observe(el); });
  }

  /* ── Sticky filter bar scroll shadow ─────────────────────────── */

  function initStickyFilterShadow() {
    var filterBar = document.getElementById('filter-bar-wrapper');
    if (!filterBar) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        filterBar.classList.toggle('is-scrolled', !entry.isIntersecting);
      });
    }, { threshold: 1.0, rootMargin: '-57px 0px 0px 0px' });

    observer.observe(filterBar);
  }

  /* ── Smooth scroll for anchor links ────────────────────────── */

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var target = document.querySelector(link.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  global.animateValue = animateValue;
  global.initScrollReveal = initScrollReveal;
  global.initStickyFilterShadow = initStickyFilterShadow;
  global.initSmoothScroll = initSmoothScroll;

}(window));
