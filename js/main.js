(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasFinePointer = window.matchMedia("(pointer: fine)").matches;

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

  // Scroll-spy: highlight the current section's nav link with a real state
  // (an underline that grows in), not an unstyled default. IntersectionObserver
  // only - no per-frame scroll math needed for this.
  var sections = Array.prototype.slice.call(document.querySelectorAll("main section[id]"));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll("[data-nav]"));

  function setActive(id) {
    navLinks.forEach(function (link) {
      link.classList.toggle("is-active", link.getAttribute("href") === "#" + id);
    });
  }

  if (sections.length && "IntersectionObserver" in window) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach(function (section) { spy.observe(section); });
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

  // ==========================================================================
  // Consolidated scroll pass. Everything that needs to know "how far down
  // the page / through the hero are we" reads from the same rAF-batched tick
  // instead of each registering its own scroll listener and re-measuring
  // layout independently. `heroProgress` is exposed via closure to the
  // wordmark particle system below, so its scroll-driven "explode" effect
  // shares this one measurement too.
  // ==========================================================================

  var progressBar = document.getElementById("scrollProgress");
  var siteHeader = document.querySelector(".site-header");
  var hero = document.getElementById("top");
  var glow1 = document.getElementById("heroGlow1");
  var glow2 = document.getElementById("heroGlow2");
  var heroFadeEls = Array.prototype.slice.call(document.querySelectorAll(".hero-fade"));

  var heroProgress = 0; // 0 at rest, ->1 as the hero scrolls out of view

  function updateScrollDerived() {
    var doc = document.documentElement;
    var scrollTop = doc.scrollTop;

    if (progressBar) {
      var max = doc.scrollHeight - doc.clientHeight;
      var pct = max > 0 ? Math.min(1, scrollTop / max) : 0;
      progressBar.style.transform = "scaleX(" + pct + ")";
    }

    if (siteHeader) {
      siteHeader.classList.toggle("is-scrolled", scrollTop > 8);
    }

    if (hero && !prefersReducedMotion) {
      var rect = hero.getBoundingClientRect();
      heroProgress = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height * 0.65, 1)));

      if (glow1) glow1.style.transform = "translateY(" + heroProgress * 60 + "px)";
      if (glow2) glow2.style.transform = "translateY(" + heroProgress * -40 + "px)";

      if (heroFadeEls.length) {
        var fadeOpacity = Math.max(0, 1 - heroProgress * 1.15);
        var fadeShift = -heroProgress * 26;
        for (var i = 0; i < heroFadeEls.length; i++) {
          heroFadeEls[i].style.opacity = fadeOpacity;
          heroFadeEls[i].style.transform = "translateY(" + fadeShift + "px)";
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

  // Cursor-follow glow in the hero - mouse-driven, not scroll-driven, so it
  // stays a separate lightweight listener.
  var cursorGlow = document.getElementById("cursorGlow");
  if (hero && hasFinePointer && cursorGlow && !prefersReducedMotion) {
    hero.addEventListener("mousemove", function (e) {
      var rect = hero.getBoundingClientRect();
      cursorGlow.style.transform =
        "translate(" + (e.clientX - rect.left) + "px, " + (e.clientY - rect.top) + "px)";
    });
  }

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
      octx.font = "600 " + fontSize + "px Fraunces, Georgia, serif";
      octx.fillText("Genesis", off.width / 2, off.height * 0.56);

      var data = octx.getImageData(0, 0, off.width, off.height).data;
      var step = Math.max(4, Math.round(6 * dpr));
      var pts = [];
      for (var y = 0; y < off.height; y += step) {
        for (var x = 0; x < off.width; x += step) {
          if (data[(y * off.width + x) * 4 + 3] > 120) {
            pts.push({ ox: x, oy: y, x: x, y: y, vx: 0, vy: 0 });
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
      var repelRadius = 85 * dpr;
      var explode = explodeCurrent;
      var cx = canvas.width / 2;
      var cy = canvas.height / 2;

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

        if (mouse.active) {
          var dx = p.x - mx;
          var dy = p.y - my;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < repelRadius) {
            var force = (repelRadius - dist) / repelRadius;
            p.vx += (dx / dist) * force * 1.5;
            p.vy += (dy / dist) * force * 1.5;
          }
        }

        // Looser spring, more inertia: a lower pull-back constant and
        // higher damping retention read as fluid drift instead of a snap.
        p.vx += (tx - p.x) * 0.028;
        p.vy += (ty - p.y) * 0.028;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.x += p.vx;
        p.y += p.vy;

        ctx.globalAlpha = Math.max(0, 1 - explode * 0.75);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5 * dpr, 0, Math.PI * 2);
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

    // Click (or tap) to give the dots a playful shove outward from that
    // point - they drift back on their own through the same loose spring.
    canvas.addEventListener("click", function (e) {
      var rect = canvas.getBoundingClientRect();
      var cx = (e.clientX - rect.left) * dpr;
      var cy = (e.clientY - rect.top) * dpr;
      var burstRadius = 170 * dpr;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var dx = p.x - cx;
        var dy = p.y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < burstRadius) {
          var force = (burstRadius - dist) / burstRadius;
          p.vx += (dx / dist) * force * 10;
          p.vy += (dy / dist) * force * 10;
        }
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
  if (!prefersReducedMotion) {
    var confettiBurst = function (x, y) {
      for (var i = 0; i < 10; i++) {
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
      });
    });
  }
})();
