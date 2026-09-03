(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasFinePointer = window.matchMedia("(pointer: fine)").matches;

  // Toasts: short-lived feedback shared by every easter egg below, so they
  // all speak in the same voice instead of each rolling its own popup.
  var toastContainer = document.getElementById("toastContainer");
  function showToast(message) {
    if (!toastContainer) return;
    var toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add("is-visible"); });
    setTimeout(function () {
      toast.classList.remove("is-visible");
      setTimeout(function () { toast.remove(); }, 350);
    }, 2600);
  }

  // Sound: a couple of quick oscillator tones for a "coin" blip, opt-in only
  // and built lazily on first use so no AudioContext exists until someone
  // actually asks for one (autoplay policies want a user gesture anyway).
  var soundEnabled = false;
  try { soundEnabled = localStorage.getItem("genesisSound") === "on"; } catch (e) { /* private mode, etc. */ }
  var audioCtx = null;

  function playCoin() {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var now = audioCtx.currentTime;
      [880, 1320].forEach(function (freq, i) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.05, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.12);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.13);
      });
    } catch (e) { /* Web Audio unsupported - silently skip */ }
  }

  var soundToggle = document.getElementById("soundToggle");
  if (soundToggle) {
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
    soundToggle.addEventListener("click", function () {
      soundEnabled = !soundEnabled;
      soundToggle.setAttribute("aria-pressed", String(soundEnabled));
      try { localStorage.setItem("genesisSound", soundEnabled ? "on" : "off"); } catch (e) {}
      if (soundEnabled) playCoin();
      showToast(soundEnabled ? "Sound on. Try clicking things." : "Sound off.");
    });
  }

  // Footer year
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Mobile nav toggle
  var toggle = document.getElementById("navToggle");
  var panel = document.getElementById("mobilePanel");

  if (toggle && panel) {
    toggle.addEventListener("click", function () {
      var isOpen = panel.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    panel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        panel.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Reveal-on-scroll: the page renders fully visible at rest. Only elements
  // that start below the first viewport get a "pending" state to animate
  // in from, so nothing is ever hidden waiting on JS at first paint.
  var revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal"));

  if (!prefersReducedMotion && "IntersectionObserver" in window) {
    var vh = window.innerHeight;
    revealEls.forEach(function (el) {
      if (el.getBoundingClientRect().top > vh * 0.9) el.classList.add("pending");
    });

    var revealObserver = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.remove("pending");
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  }

  // FAQ accordions: click a question, its answer opens via the CSS
  // grid-rows transition (see styles.css) - only one JS job is toggling
  // the class, no height measuring.
  document.querySelectorAll(".faq-item").forEach(function (item) {
    var btn = item.querySelector(".faq-question");
    if (!btn) return;
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", function () {
      var isOpen = item.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(isOpen));
    });
  });

  // Stat count-up: numbers in [data-count-to] animate from 0 once they
  // scroll into view. Respects reduced motion by just settling instantly.
  document.querySelectorAll("[data-count-to]").forEach(function (el) {
    var target = parseFloat(el.getAttribute("data-count-to"));
    if (isNaN(target)) return;

    function settle() { el.textContent = target; }

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      settle();
      return;
    }

    var obs = new IntersectionObserver(
      function (entries, o) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          o.unobserve(el);
          var start = performance.now();
          var DURATION = 1100;
          (function tick(now) {
            var t = Math.min(1, (now - start) / DURATION);
            var eased = 1 - Math.pow(1 - t, 3);
            el.textContent = Math.round(target * eased);
            if (t < 1) requestAnimationFrame(tick);
            else settle();
          })(start);
        });
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
  });

  // ==========================================================================
  // Consolidated scroll pass. Everything that needs to know "how far down
  // the page / through the hero are we" reads from the same rAF-batched tick
  // instead of each registering its own scroll listener and re-measuring
  // layout independently. `heroProgress` is exposed via closure to the
  // wordmark particle system below, so its scroll-driven "explode" effect
  // shares this one measurement too.
  // ==========================================================================

  var siteHeader = document.querySelector(".site-header");
  var hero = document.getElementById("top");
  var heroGrid = document.querySelector(".hero-grid");
  var heroFadeEls = Array.prototype.slice.call(document.querySelectorAll(".hero-fade"));

  // Horizontal sequence: a tall section whose inner track slides sideways
  // while the viewport is pinned to it.
  var hseq = document.querySelector(".hseq");
  var hseqTrack = document.querySelector(".hseq-track");

  // Pinned story: the steps light up in turn while the stage holds.
  var pinnedSteps = Array.prototype.slice.call(document.querySelectorAll(".pinned-step"));
  var pinnedFrames = Array.prototype.slice.call(document.querySelectorAll(".pinned-frame"));
  var lastPinnedIndex = -1;

  var heroProgress = 0; // 0 at rest, ->1 as the hero scrolls out of view

  function updateScrollDerived() {
    var doc = document.documentElement;
    var scrollTop = doc.scrollTop;

    if (siteHeader) {
      siteHeader.classList.toggle("is-scrolled", scrollTop > 8);
    }

    if (hero && !prefersReducedMotion) {
      var rect = hero.getBoundingClientRect();
      heroProgress = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height * 0.65, 1)));

      // The grid drifts slower than the content in front of it, so the page
      // has a back plane instead of one flat surface.
      if (heroGrid) heroGrid.style.transform = "translate3d(0," + heroProgress * 48 + "px,0)";

      if (heroFadeEls.length) {
        var fadeOpacity = Math.max(0, 1 - heroProgress * 1.15);
        var fadeShift = -heroProgress * 26;
        for (var i = 0; i < heroFadeEls.length; i++) {
          heroFadeEls[i].style.opacity = fadeOpacity;
          heroFadeEls[i].style.transform = "translateY(" + fadeShift + "px)";
        }
      }
    }

    // --- Horizontal sequence ---------------------------------------------
    // Distance scrolled through the section maps 1:1 onto how far the track
    // still has to travel, so the last panel lands exactly as the section
    // releases. Disabled below 860px, where the track is a stacked list.
    if (hseq && hseqTrack && window.innerWidth > 860) {
      var hRect = hseq.getBoundingClientRect();
      var travel = hseqTrack.scrollWidth - window.innerWidth;
      if (travel > 0) {
        var scrollable = hseq.offsetHeight - window.innerHeight;
        var p = scrollable > 0 ? Math.min(1, Math.max(0, -hRect.top / scrollable)) : 0;
        hseq.style.setProperty("--hx", (p * travel).toFixed(2));
      }
    }

    // Anything that ended up above the viewport without the observer catching
    // it (fast fling, anchor jump) is revealed here rather than left blank.
    if (revealEls.length) {
      for (var r = revealEls.length - 1; r >= 0; r--) {
        var el = revealEls[r];
        if (!el.classList.contains("pending")) continue;
        if (el.getBoundingClientRect().bottom < 0) {
          el.classList.remove("pending");
          el.classList.add("is-visible");
        }
      }
    }

    // --- Pinned story -----------------------------------------------------
    // Whichever step is nearest the middle of the viewport is the active one.
    if (pinnedSteps.length) {
      var mid = window.innerHeight * 0.5;
      var best = 0;
      var bestDist = Infinity;
      for (var s = 0; s < pinnedSteps.length; s++) {
        var r = pinnedSteps[s].getBoundingClientRect();
        var d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestDist) { bestDist = d; best = s; }
      }
      if (best !== lastPinnedIndex) {
        lastPinnedIndex = best;
        for (var t = 0; t < pinnedSteps.length; t++) {
          pinnedSteps[t].classList.toggle("is-active", t === best);
        }
        for (var f = 0; f < pinnedFrames.length; f++) {
          pinnedFrames[f].classList.toggle("is-active", f === best);
        }
      }
    }
  }

  // Standard scroll-rAF coalescing pattern: a burst of scroll events collapses
  // into at most one measurement + write per animation frame.
  var scrollTicking = false;
  function onScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(function () {
      updateScrollDerived();
      scrollTicking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  updateScrollDerived();

  // The interactive wordmark: renders "Genesis" as a field of dot particles
  // on canvas, then lets the mouse repel them and the scroll position spread
  // them apart. Falls back to the static SVG dot-matrix (already in the DOM)
  // when JS, canvas, or reduced-motion rules it out.
  (function initWordmark() {
    var wrap = document.getElementById("wordmarkWrap");
    var svgFallback = document.getElementById("wordmarkSvg");
    if (!wrap || prefersReducedMotion) return;

    var canvas = document.createElement("canvas");
    canvas.className = "wordmark-canvas";
    canvas.setAttribute("aria-hidden", "true");
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;

    wrap.appendChild(canvas);
    if (svgFallback) svgFallback.style.display = "none";

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var particles = [];
    var mouse = { x: -9999, y: -9999, active: false };
    var explodeCurrent = 0;
    var visible = true;
    var dotRadius = 1.5;
    var accentColor = "#4fc3ff";

    function readAccent() {
      var v = getComputedStyle(document.documentElement).getPropertyValue("--accent");
      if (v && v.trim()) accentColor = v.trim();
    }

    function buildParticles() {
      var rect = wrap.getBoundingClientRect();
      var w = Math.max(rect.width, 260);
      var h = w * (190 / 920);

      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);

      var off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      var octx = off.getContext("2d");
      octx.fillStyle = "#fff";
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      var fontSize = off.height * 0.86;
      octx.font = "600 " + fontSize + "px Lora, Georgia, serif";
      octx.fillText("Genesis", off.width / 2, off.height * 0.56);

      var data = octx.getImageData(0, 0, off.width, off.height).data;
      var step = Math.min(14, Math.max(4, Math.round(canvas.width / 190)));
      dotRadius = Math.max(1.1, step * 0.26);

      var pts = [];
      for (var y = 0; y < off.height; y += step) {
        for (var x = 0; x < off.width; x += step) {
          if (data[(y * off.width + x) * 4 + 3] > 120) {
            pts.push({
              ox: x, oy: y, x: x, y: y, vx: 0, vy: 0,
              // Per-particle phase/speed so the idle drift below isn't
              // every dot breathing in perfect unison.
              seed: Math.random() * Math.PI * 2,
              speed: 0.5 + Math.random() * 0.7
            });
          }
        }
      }
      particles = pts;
    }

    function frame() {
      requestAnimationFrame(frame);
      if (!visible || !particles.length) return;

      // Smoothly chase the scroll-driven target (shared with the consolidated
      // scroll pass above) instead of snapping straight to it every frame -
      // this is what makes the scatter feel liquid rather than mechanically
      // locked to the scroll position.
      explodeCurrent += (heroProgress - explodeCurrent) * 0.09;

      var rect = canvas.getBoundingClientRect();
      var mx = (mouse.x - rect.left) * dpr;
      var my = (mouse.y - rect.top) * dpr;
      var repelRadius = 130 * dpr;
      var explode = explodeCurrent;
      var cx = canvas.width / 2;
      var cy = canvas.height / 2;
      var t = performance.now() * 0.001;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = accentColor;

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var tx = p.ox;
        var ty = p.oy;

        if (explode > 0.001) {
          tx += (p.ox - cx) * explode * 0.6;
          ty += (p.oy - cy) * explode * 0.6 - explode * 46 * dpr;
        }

        // A slow, per-particle idle drift so the wordmark is never
        // perfectly still even before anyone touches it.
        tx += Math.sin(t * p.speed + p.seed) * 3.2 * dpr;
        ty += Math.cos(t * p.speed * 0.85 + p.seed) * 3.2 * dpr;

        if (mouse.active) {
          var dx = p.x - mx;
          var dy = p.y - my;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < repelRadius) {
            var force = (repelRadius - dist) / repelRadius;
            p.vx += (dx / dist) * force * 3.6;
            p.vy += (dy / dist) * force * 3.6;
          }
        }

        // Loose spring, generous inertia: a low pull-back constant and high
        // damping retention read as fluid, slow-settling drift rather than
        // a snap back to place.
        p.vx += (tx - p.x) * 0.012;
        p.vy += (ty - p.y) * 0.012;
        p.vx *= 0.945;
        p.vy *= 0.945;
        p.x += p.vx;
        p.y += p.vy;

        ctx.globalAlpha = Math.max(0, 1 - explode * 0.75);
        ctx.beginPath();
        ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (hasFinePointer) {
      wrap.addEventListener("mousemove", function (e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;
      });
      wrap.addEventListener("mouseleave", function () {
        mouse.active = false;
      });
    }

    // Shared burst impulse - dots within radius get shoved outward from
    // (cx, cy) in canvas-local pixel space, then drift back on their own
    // through the same loose spring used everywhere else. Used by both a
    // direct click/tap and the "genesis" easter egg below.
    function burst(cx, cy, radius, strength) {
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var dx = p.x - cx;
        var dy = p.y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < radius) {
          var force = (radius - dist) / radius;
          p.vx += (dx / dist) * force * strength;
          p.vy += (dy / dist) * force * strength;
        }
      }
    }

    // Click (or tap) to give the dots a playful shove outward from that point.
    canvas.addEventListener("click", function (e) {
      var rect = canvas.getBoundingClientRect();
      burst((e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr, 210 * dpr, 15);
    });

    // Secret phrase: type "genesis" anywhere on the page for a bigger burst
    // radiating out from the middle of the wordmark, plus a toast. A rolling
    // buffer of the last few keys typed, compared case-insensitively.
    var typedBuffer = "";
    document.addEventListener("keydown", function (e) {
      if (e.key.length !== 1) return; // ignore Shift, Enter, arrow keys, etc.
      var tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
      typedBuffer = (typedBuffer + e.key).slice(-7).toLowerCase();
      if (typedBuffer === "genesis") {
        burst(canvas.width / 2, canvas.height / 2, canvas.width * 0.7, 22);
        showToast("You found it. Genesis mode: activated.");
        typedBuffer = "";
      }
    });

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(buildParticles, 200);
    });

    if ("IntersectionObserver" in window && hero) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
        });
      }).observe(hero);
    }

    readAccent();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(buildParticles);
    } else {
      buildParticles();
    }
    requestAnimationFrame(frame);
    // Keyboard access for the horizontal sequence: the track is driven by page
  // scroll, so tabbing to a panel that is currently translated off-screen
  // would focus something invisible. Focusing a panel scrolls the page to the
  // point where that panel is on screen, which is the same position a mouse
  // user would have scrolled to.
  if (hseq && hseqTrack) {
    var hseqPanels = Array.prototype.slice.call(hseqTrack.querySelectorAll(".hseq-panel"));
    hseqPanels.forEach(function (panel, i) {
      panel.addEventListener("focus", function () {
        if (window.innerWidth <= 860) return;
        var travel = hseqTrack.scrollWidth - window.innerWidth;
        if (travel <= 0) return;
        var scrollable = hseq.offsetHeight - window.innerHeight;
        // How far along the track this panel sits, clamped into range.
        var frac = hseqPanels.length > 1 ? i / (hseqPanels.length - 1) : 0;
        var target = hseq.offsetTop + frac * scrollable;
        window.scrollTo({ top: target, behavior: prefersReducedMotion ? "auto" : "smooth" });
      });
    });
  }

  // Page transitions: internal links fade the page out before navigating, so
  // moving between the five pages reads as one continuous site. The navigation
  // is what actually matters, so it is scheduled on a timer that fires whether
  // or not the transition finishes, and modified clicks (new tab, download,
  // external) are left entirely alone.
  if (!prefersReducedMotion) {
    document.addEventListener("click", function (e) {
      var link = e.target.closest && e.target.closest("a");
      if (!link) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (link.target === "_blank" || link.hasAttribute("download")) return;

      var href = link.getAttribute("href");
      if (!href || href.charAt(0) === "#" || /^[a-z]+:/i.test(href)) return;
      if (link.origin !== window.location.origin) return;
      if (link.pathname === window.location.pathname) return;

      e.preventDefault();
      document.body.classList.add("is-leaving");
      setTimeout(function () { window.location.href = link.href; }, 180);
    });

    // Coming back via the back button restores a faded-out page from the
    // bfcache, so clear the class on show.
    window.addEventListener("pageshow", function () {
      document.body.classList.remove("is-leaving");
    });
  }
})();

  // Magnetic buttons + card tilt: fine pointer only, and skipped entirely
  // under reduced motion (continuous mouse-driven movement is exactly what
  // that preference asks to avoid, even though it's not a scroll effect).
  if (hasFinePointer && !prefersReducedMotion) {
    document.querySelectorAll(".btn").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var r = btn.getBoundingClientRect();
        var mx = (e.clientX - r.left - r.width / 2) * 0.22;
        var my = (e.clientY - r.top - r.height / 2) * 0.3;
        btn.style.setProperty("--magx", mx.toFixed(1) + "px");
        btn.style.setProperty("--magy", my.toFixed(1) + "px");
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.setProperty("--magx", "0px");
        btn.style.setProperty("--magy", "0px");
      });
    });

    // Card tilt: founder and involve cards lean toward the cursor in 3D.
    document.querySelectorAll(".founder-card, .involve-card").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--rx", (-py * 6).toFixed(2) + "deg");
        card.style.setProperty("--ry", (px * 6).toFixed(2) + "deg");
      });
      card.addEventListener("mouseleave", function () {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    });
  }

  // Confetti burst: a small scatter of accent dots from wherever a button is
  // clicked. Purely decorative - it never blocks the link/scroll it's on.
  var confettiBurst = function (x, y, count) {
    if (prefersReducedMotion) return;
    for (var i = 0; i < (count || 10); i++) {
      var dot = document.createElement("span");
      dot.className = "confetti-dot";
      var angle = Math.random() * Math.PI * 2;
      var dist = 24 + Math.random() * 46;
      dot.style.setProperty("--dx", (Math.cos(angle) * dist).toFixed(1) + "px");
      dot.style.setProperty("--dy", (Math.sin(angle) * dist).toFixed(1) + "px");
      dot.style.left = x + "px";
      dot.style.top = y + "px";
      document.body.appendChild(dot);
      dot.addEventListener("animationend", function () {
        this.remove();
      });
    }
  };

  document.querySelectorAll(".btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      confettiBurst(e.clientX, e.clientY);
      playCoin();
    });
  });

  // Double-click anywhere for a small burst at the cursor - a quiet bonus
  // for anyone who idly double-clicks empty space. Doesn't interfere with
  // normal text-selection double-click; it just adds a flourish on top.
  if (!prefersReducedMotion) {
    document.addEventListener("dblclick", function (e) {
      if (e.target.closest(".btn, a, button, input, textarea")) return;
      confettiBurst(e.clientX, e.clientY, 8);
    });
  }

  // Hold-to-charge ring on the primary hero CTA. Purely decorative - a quick
  // click still fires the link immediately either way, this is just a fun
  // flourish for anyone who lingers on the button.
  var chargeBtn = document.querySelector(".chargeable");
  if (chargeBtn && hasFinePointer && !prefersReducedMotion) {
    var chargeRaf = null;
    var chargeStart = 0;
    var CHARGE_MS = 900;

    function chargeStep() {
      var pct = Math.min(100, ((performance.now() - chargeStart) / CHARGE_MS) * 100);
      chargeBtn.style.setProperty("--charge", pct.toFixed(1));
      if (pct >= 100) {
        chargeBtn.classList.add("is-charged");
        confettiBurst(
          chargeBtn.getBoundingClientRect().left + chargeBtn.offsetWidth / 2,
          chargeBtn.getBoundingClientRect().top + chargeBtn.offsetHeight / 2,
          14
        );
        return;
      }
      chargeRaf = requestAnimationFrame(chargeStep);
    }

    function chargeReset() {
      if (chargeRaf) cancelAnimationFrame(chargeRaf);
      chargeBtn.classList.remove("is-charged");
      chargeBtn.style.setProperty("--charge", 0);
    }

    chargeBtn.addEventListener("pointerdown", function () {
      chargeStart = performance.now();
      chargeRaf = requestAnimationFrame(chargeStep);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (evt) {
      chargeBtn.addEventListener(evt, chargeReset);
    });
  }

  // Draggable dot clusters: grab one, fling it, it springs back home. Purely
  // for the "wait, can I move that?" moment - no state persists.
  if (hasFinePointer || "ontouchstart" in window) {
    document.querySelectorAll(".dot-cluster").forEach(function (cluster) {
      var dragging = false;
      var startX = 0, startY = 0;

      cluster.addEventListener("pointerdown", function (e) {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        cluster.classList.remove("is-returning");
        cluster.classList.add("is-dragging");
        cluster.setPointerCapture(e.pointerId);
      });

      cluster.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        cluster.style.transform = "translate(" + (e.clientX - startX) + "px, " + (e.clientY - startY) + "px)";
      });

      function release() {
        if (!dragging) return;
        dragging = false;
        cluster.classList.add("is-returning");
        cluster.style.transform = "translate(0, 0)";
        setTimeout(function () {
          cluster.classList.remove("is-dragging", "is-returning");
          cluster.style.transform = "";
        }, 560);
      }

      cluster.addEventListener("pointerup", release);
      cluster.addEventListener("pointercancel", release);
    });
  }

  // Nav brand: click it five times quickly and it notices.
  var brandLink = document.querySelector(".brand");
  if (brandLink) {
    var brandClicks = 0;
    var brandTimer = null;
    brandLink.addEventListener("click", function () {
      brandClicks++;
      clearTimeout(brandTimer);
      brandTimer = setTimeout(function () { brandClicks = 0; }, 1800);
      if (brandClicks >= 5) {
        brandClicks = 0;
        showToast("Okay, stop that. (But also, hi. \u{1F44B})");
      }
    });
  }

  // Keyboard access for the horizontal sequence: the track is driven by page
  // scroll, so tabbing to a panel that is currently translated off-screen
  // would focus something invisible. Focusing a panel scrolls the page to the
  // point where that panel is on screen, which is the same position a mouse
  // user would have scrolled to.
  if (hseq && hseqTrack) {
    var hseqPanels = Array.prototype.slice.call(hseqTrack.querySelectorAll(".hseq-panel"));
    hseqPanels.forEach(function (panel, i) {
      panel.addEventListener("focus", function () {
        if (window.innerWidth <= 860) return;
        var travel = hseqTrack.scrollWidth - window.innerWidth;
        if (travel <= 0) return;
        var scrollable = hseq.offsetHeight - window.innerHeight;
        // How far along the track this panel sits, clamped into range.
        var frac = hseqPanels.length > 1 ? i / (hseqPanels.length - 1) : 0;
        var target = hseq.offsetTop + frac * scrollable;
        window.scrollTo({ top: target, behavior: prefersReducedMotion ? "auto" : "smooth" });
      });
    });
  }

  // Page transitions: internal links fade the page out before navigating, so
  // moving between the five pages reads as one continuous site. The navigation
  // is what actually matters, so it is scheduled on a timer that fires whether
  // or not the transition finishes, and modified clicks (new tab, download,
  // external) are left entirely alone.
  if (!prefersReducedMotion) {
    document.addEventListener("click", function (e) {
      var link = e.target.closest && e.target.closest("a");
      if (!link) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (link.target === "_blank" || link.hasAttribute("download")) return;

      var href = link.getAttribute("href");
      if (!href || href.charAt(0) === "#" || /^[a-z]+:/i.test(href)) return;
      if (link.origin !== window.location.origin) return;
      if (link.pathname === window.location.pathname) return;

      e.preventDefault();
      document.body.classList.add("is-leaving");
      setTimeout(function () { window.location.href = link.href; }, 180);
    });

    // Coming back via the back button restores a faded-out page from the
    // bfcache, so clear the class on show.
    window.addEventListener("pageshow", function () {
      document.body.classList.remove("is-leaving");
    });
  }
})();
