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
  var revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal, .reveal-3d, .section-3d"));

  // Staggered groups: a [data-stagger] container hands each revealing child an
  // index, and CSS turns that into a transition-delay so a grid arrives in
  // sequence rather than all at once. Capped at 8 steps - past that the tail
  // of the group is still animating long after the reader has moved on.
  document.querySelectorAll("[data-stagger]").forEach(function (group) {
    var step = 0;
    Array.prototype.forEach.call(group.children, function (child) {
      if (!child.classList.contains("reveal") &&
          !child.classList.contains("reveal-3d") &&
          !child.classList.contains("section-3d")) return;
      child.style.setProperty("--i", Math.min(step, 7));
      step++;
    });
  });

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
  // layout independently. `heroProgress` is exposed via closure so the hero's
  // depth layers all share this one measurement.
  // ==========================================================================

  var siteHeader = document.querySelector(".site-header");
  var hero = document.getElementById("top");
  var heroFadeEls = Array.prototype.slice.call(document.querySelectorAll(".hero-fade"));
  var liquidLayer = document.querySelector(".liquid");

  // 3D scenes: each object's rotation is tied to how far it has travelled
  // through the viewport, so scrolling turns the object rather than just
  // sliding it. Small angle range keeps it readable, per the motion rules.
  var scenes = Array.prototype.slice.call(document.querySelectorAll(".scene-obj"));

  // Layered vertical drift: decorative elements only. Each carries a
  // [data-drift] factor and travels at its own rate as it crosses the
  // viewport, so a section resolves in depth instead of arriving flat.
  // Body copy is never in this set - the motion rules are explicit that
  // running text must not be parallaxed.
  var driftEls = Array.prototype.slice.call(document.querySelectorAll("[data-drift]"));

  // The mark itself, now that the particle field is gone: it lifts, tilts
  // back and recedes as the hero scrolls away.
  var wordmarkWrap = document.getElementById("wordmarkWrap");

  // The spinning coin turns on its own axis in CSS; the scroll pass only
  // tips it, so the two compose instead of fighting for the transform.
  var coins = Array.prototype.slice.call(document.querySelectorAll(".coin"));

  // Pinned story: the steps light up in turn while the stage holds.
  var pinnedVisual = document.querySelector(".pinned-visual");
  var pinnedCaption = document.getElementById("pinnedCaption");
  var captionTimer = null;
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

      // Depth: the generated canvas field drifts slower than the copy in
      // front of it. Decorative layer only - the skill's parallax rule is
      // explicit that body copy must never be parallaxed.
      if (liquidLayer) {
        if (heroProgress > 0 && heroProgress < 1) {
          liquidLayer.style.transform = "translate3d(0," + (heroProgress * 46).toFixed(1) + "px,0)";
          liquidLayer.style.willChange = "transform";
        } else if (liquidLayer.style.willChange) {
          // Release GPU memory once the hero is parked at either end.
          liquidLayer.style.willChange = "auto";
        }
      }

      if (heroFadeEls.length) {
        var fadeOpacity = Math.max(0, 1 - heroProgress * 1.15);
        var fadeShift = -heroProgress * 26;
        for (var i = 0; i < heroFadeEls.length; i++) {
          heroFadeEls[i].style.opacity = fadeOpacity;
          heroFadeEls[i].style.transform = "translateY(" + fadeShift + "px)";
        }
      }

      // The mark tips back and recedes on its own axis - the depth cue the
      // hero used to get from the particle field.
      if (wordmarkWrap) {
        wordmarkWrap.style.setProperty("--wm-y", (heroProgress * -34).toFixed(1));
        wordmarkWrap.style.setProperty("--wm-rx", (heroProgress * 13).toFixed(2));
        wordmarkWrap.style.setProperty("--wm-scale", (1 - heroProgress * 0.09).toFixed(4));
      }
    }

    // --- 3D scenes -------------------------------------------------------
    if (scenes.length && !prefersReducedMotion) {
      var vhNow = window.innerHeight;
      for (var s = 0; s < scenes.length; s++) {
        var sr = scenes[s].getBoundingClientRect();
        if (sr.bottom < -200 || sr.top > vhNow + 200) continue; // offscreen: skip
        // -1 (below the fold) .. 1 (above it), 0 when centred.
        var t = (vhNow / 2 - (sr.top + sr.height / 2)) / (vhNow / 2 + sr.height / 2);
        t = Math.max(-1, Math.min(1, t));
        scenes[s].style.setProperty("--rx", (14 + t * 16).toFixed(2));
        scenes[s].style.setProperty("--ry", (-22 + t * 30).toFixed(2));
      }
    }

    // --- Spinning coin ---------------------------------------------------
    if (coins.length && !prefersReducedMotion) {
      var vhC = window.innerHeight;
      for (var c = 0; c < coins.length; c++) {
        var cr = coins[c].getBoundingClientRect();
        if (cr.bottom < -150 || cr.top > vhC + 150) continue; // offscreen: skip
        var ct = (vhC / 2 - (cr.top + cr.height / 2)) / (vhC / 2 + cr.height / 2);
        ct = Math.max(-1, Math.min(1, ct));
        coins[c].style.setProperty("--coin-rx", (ct * -22).toFixed(2));
      }
    }

    // --- Layered drift ---------------------------------------------------
    if (driftEls.length && !prefersReducedMotion) {
      var vhD = window.innerHeight;
      for (var d = 0; d < driftEls.length; d++) {
        var dr = driftEls[d].getBoundingClientRect();
        if (dr.bottom < -160 || dr.top > vhD + 160) continue; // offscreen: skip
        // -1 entering from below .. 1 leaving past the top.
        var dt = (vhD / 2 - (dr.top + dr.height / 2)) / (vhD / 2 + dr.height / 2);
        dt = Math.max(-1, Math.min(1, dt));
        var factor = parseFloat(driftEls[d].getAttribute("data-drift")) || 0;
        driftEls[d].style.setProperty("--drift", (dt * factor * -30).toFixed(1) + "px");
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
    // The active step is the one nearest the middle of the STAGE, not the
    // middle of the viewport. The stage is sticky at 22vh, so its centre and
    // the viewport's centre are ~60px apart, and before it sticks they are
    // further apart still - measuring against the viewport made the big
    // numeral change while the reader was still on the previous step.
    // Measuring against the stage keeps the numeral and the text beside it
    // in step by construction, stuck or not.
    if (pinnedSteps.length) {
      var mid = window.innerHeight * 0.5;
      if (pinnedVisual) {
        var vr = pinnedVisual.getBoundingClientRect();
        if (vr.height) mid = vr.top + vr.height / 2;
      }
      var best = 0;
      var bestDist = Infinity;
      for (var s = 0; s < pinnedSteps.length; s++) {
        var r = pinnedSteps[s].getBoundingClientRect();
        var d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestDist) { bestDist = d; best = s; }
      }
      // The active plate tips with the stage's own travel, so the visual has
      // scroll-linked depth rather than only cross-fading.
      if (pinnedVisual && !prefersReducedMotion) {
        var pv = pinnedVisual.getBoundingClientRect();
        var pt = (window.innerHeight / 2 - (pv.top + pv.height / 2)) /
                 (window.innerHeight / 2 + pv.height / 2);
        pinnedVisual.style.setProperty("--stage-rx",
          (Math.max(-1, Math.min(1, pt)) * -9).toFixed(2));
      }

      if (best !== lastPinnedIndex) {
        lastPinnedIndex = best;
        for (var t = 0; t < pinnedSteps.length; t++) {
          pinnedSteps[t].classList.toggle("is-active", t === best);
        }
        for (var f = 0; f < pinnedFrames.length; f++) {
          pinnedFrames[f].classList.toggle("is-active", f === best);
        }

        // The caption is a single element whose text is swapped, so two
        // captions are never on screen at once. Fade out, swap, fade back.
        if (pinnedCaption) {
          var nextCaption = pinnedFrames[best] &&
                            pinnedFrames[best].getAttribute("data-caption");
          if (nextCaption && nextCaption !== pinnedCaption.textContent) {
            if (prefersReducedMotion) {
              pinnedCaption.textContent = nextCaption;
            } else {
              clearTimeout(captionTimer);
              pinnedCaption.classList.add("is-swapping");
              captionTimer = setTimeout(function () {
                pinnedCaption.textContent = nextCaption;
                pinnedCaption.classList.remove("is-swapping");
              }, 190);
            }
          }
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
  // ==========================================================================
  // Liquid reveal (home hero). A soft radial brush stamps a second field over
  // the base along the pointer trail, and the trail decays every frame.
  // There is no photography for this site, so rather than fake any, both
  // layers are generated: a pale dot field and a deep navy one beneath it.
  // ==========================================================================
  (function liquidReveal(){
    var wrap = document.querySelector(".liquid");
    if (!wrap || prefersReducedMotion) return;

    var base  = wrap.querySelector(".liquid-base");
    var brush = wrap.querySelector(".liquid-brush");
    if (!base || !brush) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var ctx = brush.getContext("2d");
    if (!ctx) return;

    var BRUSH_RADIUS = 45, DECAY = 0.016, IDLE_FRAMES = 120;
    var radius = BRUSH_RADIUS * dpr;
    var cover = document.createElement("canvas");
    var stampC = document.createElement("canvas");
    var points = [], last = null, idle = 0, W = 0, H = 0;

    // Gradient ground plus a jittered grid of dots - the same motif as the
    // Genesis mark, so the revealed layer belongs to the same brand.
    function paintField(canvas, o){
      var g = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
      var grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, o.from); grad.addColorStop(1, o.to);
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      var step = o.step * dpr, r = o.r * dpr;
      g.fillStyle = o.dot;
      for (var y = step / 2; y < h; y += step) {
        for (var x = step / 2; x < w; x += step) {
          var jx = Math.sin(x * 0.7 + y * 1.3) * step * 0.18;
          var jy = Math.cos(x * 1.1 - y * 0.6) * step * 0.18;
          g.beginPath(); g.arc(x + jx, y + jy, r, 0, Math.PI * 2); g.fill();
        }
      }
    }

    function size(){
      var rect = wrap.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width * dpr));
      H = Math.max(1, Math.round(rect.height * dpr));
      [base, brush].forEach(function (c) {
        c.width = W; c.height = H;
        c.style.width = rect.width + "px"; c.style.height = rect.height + "px";
      });
      radius = BRUSH_RADIUS * dpr;
      paintField(base,  { from:"#eef3fa", to:"#dce7f6", step:26, r:1.6, dot:"rgba(26,86,219,0.15)" });
      cover.width = W; cover.height = H;
      paintField(cover, { from:"#0b1729", to:"#12325f", step:22, r:2.0, dot:"rgba(120,180,255,0.55)" });
      var d = Math.ceil(radius * 2);
      stampC.width = d; stampC.height = d;
      ctx.clearRect(0, 0, W, H);
    }

    size();
    if (window.ResizeObserver) new ResizeObserver(size).observe(wrap);
    else window.addEventListener("resize", size, { passive: true });

    function stamp(x, y){
      var d = stampC.width, c = d / 2, g = stampC.getContext("2d");
      g.clearRect(0, 0, d, d);
      g.globalCompositeOperation = "source-over";
      var grad = g.createRadialGradient(c, c, 0, c, c, c);
      grad.addColorStop(0,    "rgba(255,255,255,1)");
      grad.addColorStop(0.55, "rgba(255,255,255,0.82)");
      grad.addColorStop(1,    "rgba(255,255,255,0)");
      g.fillStyle = grad; g.fillRect(0, 0, d, d);
      g.globalCompositeOperation = "source-in";
      g.drawImage(cover, x - c, y - c, d, d, 0, 0, d, d);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(stampC, x - c, y - c);
    }

    window.addEventListener("pointermove", function (e) {
      var rect = brush.getBoundingClientRect();
      var x = (e.clientX - rect.left) * dpr;
      var y = (e.clientY - rect.top) * dpr;
      if (x < -radius || y < -radius || x > W + radius || y > H + radius) { last = null; return; }
      if (last) {
        var dx = x - last.x, dy = y - last.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var step = Math.max(radius * 0.3, 1);
        var n = Math.min(Math.ceil(dist / step), 60);
        for (var i = 1; i <= n; i++) points.push({ x: last.x + dx * (i / n), y: last.y + dy * (i / n) });
      } else points.push({ x: x, y: y });
      last = { x: x, y: y };
    }, { passive: true });

    (function tick(){
      requestAnimationFrame(tick);
      var drawing = points.length > 0;
      if (drawing) idle = 0; else if (++idle > IDLE_FRAMES) return;

      var fade = drawing ? DECAY : Math.min(DECAY + idle * 0.004, 0.5);
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0," + fade + ")";
      ctx.fillRect(0, 0, W, H);

      if (drawing) { for (var i = 0; i < points.length; i++) stamp(points[i].x, points[i].y); points = []; }
      else if (idle === IDLE_FRAMES) ctx.clearRect(0, 0, W, H);
    })();
  })();

  // ==========================================================================
  // Focal 3D tilt. The skill caps this at one or two targets per screen and
  // says to clamp the pull so the element never leaves its own hit box, so
  // this is the only tilt on the page and the rotation is held to 6 degrees.
  // ==========================================================================
  (function focalTilt(){
    var card = document.querySelector(".factcard");
    if (!card || prefersReducedMotion || !hasFinePointer) return;

    var MAX_DEG = 6, raf = null, tx = 0, ty = 0;

    function apply(){
      raf = null;
      card.style.transform =
        "perspective(900px) rotateX(" + ty.toFixed(2) + "deg) rotateY(" + tx.toFixed(2) + "deg)";
    }

    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      // Normalised -0.5..0.5, then clamped by MAX_DEG.
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2 * MAX_DEG;
      ty = -((e.clientY - r.top) / r.height - 0.5) * 2 * MAX_DEG;
      if (!raf) raf = requestAnimationFrame(apply);
    });

    // Always reverse on leave, so the tilt can never stick.
    card.addEventListener("pointerleave", function () {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      tx = ty = 0;
      card.style.transform = "";
    });
  })();

  // ==========================================================================
  // Hero fact carousel: click the card or the arrows to cycle. Wraps both ways.
  // ==========================================================================
  (function factCard(){
    var slot = document.getElementById("factSlot");
    if (!slot) return;
    var dots = document.getElementById("factDots");
    var row  = document.getElementById("factRow");
    var items = [
      { cap: "Peer-taught",   ttl: "Teens design it and teach it." },
      { cap: "One program",   ttl: "Ideas and money, never split apart." },
      { cap: "Every session", ttl: "Ends with a real pitch." }
    ];
    var i = 0;

    dots.innerHTML = items.map(function (_, k) { return "<i" + (k === 0 ? ' class="on"' : "") + "></i>"; }).join("");

    // One element for the life of the carousel, with its text swapped while it
    // is invisible. The previous version appended a fresh node per change and
    // faded the old one out, but only ever looked up a SINGLE outgoing node
    // via querySelector - so clicking faster than the 520ms cleanup orphaned
    // every extra item at full opacity and stacked the text permanently.
    // Measured: six clicks 70ms apart left five items in the DOM, all opaque.
    var item = document.createElement("div");
    item.className = "factcard-item";
    slot.appendChild(item);

    var swapTimer = null, pendingIdx = 0, pendingDir = 1;

    function paint(idx){
      var it = items[idx];
      item.innerHTML = '<p class="factcard-cap">' + it.cap + '</p>' +
                       '<p class="factcard-ttl">' + it.ttl + '</p>';
    }

    function markDots(idx){
      Array.prototype.forEach.call(dots.children, function (d, k) {
        d.classList.toggle("on", k === idx);
      });
    }

    function render(idx, dir){
      markDots(idx);                      // instant feedback, even mid-swap
      if (prefersReducedMotion) { paint(idx); return; }

      // A swap already in flight just retargets, rather than restarting the
      // fade, so holding the button down still advances at a steady rhythm.
      pendingIdx = idx; pendingDir = dir;
      if (swapTimer) return;

      item.style.transition = "";
      item.style.transform = "translateY(" + (dir > 0 ? -10 : 10) + "px)";
      item.style.opacity = "0";

      swapTimer = setTimeout(function () {
        swapTimer = null;
        paint(pendingIdx);
        // Jump to the far side with the transition off, commit that, then
        // let it settle back in - otherwise it animates across the swap.
        item.style.transition = "none";
        item.style.transform = "translateY(" + (pendingDir > 0 ? 10 : -10) + "px)";
        void item.offsetWidth;
        item.style.transition = "";
        item.style.transform = "none";
        item.style.opacity = "1";
      }, 180);
    }

    function move(step){ i = (i + step + items.length) % items.length; render(i, step); }
    paint(0); markDots(0);

    document.getElementById("factNext").addEventListener("click", function (e) { e.stopPropagation(); move(1); });
    document.getElementById("factPrev").addEventListener("click", function (e) { e.stopPropagation(); move(-1); });
    row.addEventListener("click", function () { move(1); });
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); move(1); }
    });
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
