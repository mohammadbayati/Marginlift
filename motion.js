(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const selectorGroups = [
    ".site-hero-copy > *",
    ".site-product-stage",
    ".site-outcome-band > span",
    ".site-outcome-band > h2",
    ".outcome-list article",
    ".site-section-head > *",
    ".site-feature-grid article",
    ".method-flow li",
    ".site-estimator > *",
    ".trust-rail article",
    ".trust-links",
    ".plans-grid article",
    ".site-final-cta > *",
    ".site-footer > *",
    ".auth-story-copy > *",
    ".auth-signal",
    ".auth-proof-line span",
    ".auth-panel > *",
    ".workspace-bar > div",
    ".command-hero > *",
    ".snapshot-panel",
    ".metric-card",
    ".content-section > .section-heading",
    ".content-section > .panel",
    ".decision-layout > *",
    ".action-card",
    ".uplift-lab > *",
    ".customer-product-grid > *",
    ".pilot-grid > *",
    ".stage-card",
    ".readiness-check",
    ".workspace-step",
    ".history-item"
  ];

  let observer = null;

  function reveal(element) {
    element.classList.add("is-visible");
    observer?.unobserve(element);
  }

  function getObserver() {
    if (observer || reduceMotion.matches || !("IntersectionObserver" in window)) return observer;
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) reveal(entry.target);
      });
    }, { rootMargin: "0px", threshold: 0.08 });
    return observer;
  }

  function refresh(root = document) {
    const scope = root?.querySelectorAll ? root : document;
    const nodes = [...scope.querySelectorAll(selectorGroups.join(","))];
    const activeObserver = getObserver();

    nodes.forEach((element, index) => {
      if (element.dataset.motionBound === "true") return;
      element.dataset.motionBound = "true";
      element.classList.add("motion-reveal");
      element.style.setProperty("--motion-order", String(index % 6));

      if (reduceMotion.matches || !activeObserver) {
        reveal(element);
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
        requestAnimationFrame(() => reveal(element));
      } else {
        activeObserver.observe(element);
      }
    });

    requestAnimationFrame(() => {
      scope.querySelectorAll(".qini-bars, .signal-rule, .pulse-meter").forEach(element => {
        element.classList.add("motion-data-ready");
      });
    });
  }

  function handleMotionPreference() {
    document.documentElement.classList.toggle("motion-reduced", reduceMotion.matches);
    if (reduceMotion.matches) {
      observer?.disconnect();
      observer = null;
      document.querySelectorAll(".motion-reveal").forEach(reveal);
    } else {
      refresh();
    }
  }

  document.documentElement.classList.add("motion-enabled");
  window.MarginLiftMotion = { refresh };
  document.addEventListener("DOMContentLoaded", () => {
    handleMotionPreference();
    refresh();
  });
  reduceMotion.addEventListener?.("change", handleMotionPreference);
})();
