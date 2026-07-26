const state = {
  isInitialized: false,
  metricsAnimated: false
};

const dom = {
  initBtn: document.getElementById("initiate-sequence"),
  modal: document.getElementById("vault-modal"),
  authSubmit: document.getElementById("auth-submit"),
  metricValues: document.querySelectorAll(".metric-value")
};

class CryptoWorkerBridge {
  #worker;
  #resolvers = new Map();
  #taskId = 0;

  constructor() {
    this.#initWorker();
  }

  #initWorker() {
    const workerBlob = new Blob(
      [
        `
            self.onmessage = async (e) => {
                const { id, payload } = e.data;
                const encoder = new TextEncoder();
                const data = encoder.encode(payload);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                self.postMessage({ id, result: hashHex });
            };
        `
      ],
      { type: "application/javascript" }
    );

    this.#worker = new Worker(URL.createObjectURL(workerBlob));
    this.#worker.onmessage = (e) => {
      const { id, result } = e.data;
      const resolver = this.#resolvers.get(id);
      if (resolver) {
        resolver(result);
        this.#resolvers.delete(id);
      }
    };
  }

  hash(payload) {
    return new Promise((resolve) => {
      const id = ++this.#taskId;
      this.#resolvers.set(id, resolve);
      this.#worker.postMessage({ id, payload });
    });
  }
}

const workerBridge = new CryptoWorkerBridge();

function animateMetrics() {
  if (state.metricsAnimated) return;
  state.metricsAnimated = true;

  dom.metricValues.forEach((el) => {
    const target = parseFloat(el.dataset.target);
    const isDecimal = target % 1 !== 0;
    const duration = 2000;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      const currentVal = target * easeProgress;

      el.textContent = isDecimal
        ? currentVal.toFixed(1)
        : Math.floor(currentVal);

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = isDecimal
          ? target.toFixed(target.toString().split(".")[1]?.length || 0)
          : target;
      }
    }
    requestAnimationFrame(update);
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateMetrics();
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.5 }
);

document
  .querySelectorAll(".metrics-grid")
  .forEach((grid) => observer.observe(grid));

dom.initBtn.addEventListener("click", () => {
  dom.modal.showModal();
});

dom.authSubmit.addEventListener("click", async (e) => {
  e.preventDefault();
  const keyInput = document.getElementById("cipher-key");
  const key = keyInput.value;

  if (!key) return;

  dom.authSubmit.textContent = "Processing...";
  dom.authSubmit.disabled = true;

  const hash = await workerBridge.hash(key);

  setTimeout(() => {
    dom.authSubmit.textContent = "Authenticated";
    setTimeout(() => {
      dom.modal.close();
      dom.authSubmit.textContent = "Authenticate";
      dom.authSubmit.disabled = false;
      keyInput.value = "";
      state.isInitialized = true;
    }, 800);
  }, 1200);
});
