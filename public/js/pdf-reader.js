document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('pdfReaderModal');
  if (!modal) return;

  const canvas = document.getElementById('pdfCanvas');
  const ctx = canvas.getContext('2d');
  const pageNumEl = document.getElementById('pageNum');
  const zoomLevelEl = document.getElementById('zoomLevel');
  let pdfDoc = null;
  let currentPage = 1;
  let scale = 1.0;

  const pdfReader = {
    async init(url) {
      try {
        const pdfjsLib = window.pdfjsLib;
        if (!pdfjsLib) {
          alert('PDF library not loaded. Please check your connection.');
          return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const loadingTask = pdfjsLib.getDocument(url);
        pdfDoc = await loadingTask.promise;
        pageNumEl.textContent = 'Page 1 / ' + pdfDoc.numPages;
        await renderPage(1);
      } catch (err) {
        console.error('PDF load error:', err);
        alert('Failed to load PDF. Please try downloading it instead.');
      }
    },

    async renderPage(num) {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      const renderContext = { canvasContext: ctx, viewport };
      await page.render(renderContext).promise;
      pageNumEl.textContent = 'Page ' + num + ' / ' + pdfDoc.numPages;
    },

    async nextPage() {
      if (currentPage < pdfDoc.numPages) {
        currentPage++;
        await renderPage(currentPage);
      }
    },

    async prevPage() {
      if (currentPage > 1) {
        currentPage--;
        await renderPage(currentPage);
      }
    },

    zoomIn() {
      scale = Math.min(scale + 0.2, 3.0);
      zoomLevelEl.textContent = Math.round(scale * 100) + '%';
      renderPage(currentPage);
    },

    zoomOut() {
      scale = Math.max(scale - 0.2, 0.5);
      zoomLevelEl.textContent = Math.round(scale * 100) + '%';
      renderPage(currentPage);
    },

    toggleFullscreen() {
      const body = document.querySelector('.pdf-reader-body');
      if (!body) return;
      if (!document.fullscreenElement) {
        body.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    }
  };

  window.pdfReader = pdfReader;

  document.getElementById('prevPage').addEventListener('click', () => pdfReader.prevPage());
  document.getElementById('nextPage').addEventListener('click', () => pdfReader.nextPage());
  document.getElementById('zoomOut').addEventListener('click', () => pdfReader.zoomOut());
  document.getElementById('zoomIn').addEventListener('click', () => pdfReader.zoomIn());
  document.getElementById('fullscreenBtn').addEventListener('click', () => pdfReader.toggleFullscreen());

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  document.addEventListener('keydown', (e) => {
    if (modal.style.display !== 'flex') return;
    if (e.key === 'Escape') modal.style.display = 'none';
    if (e.key === 'ArrowRight') pdfReader.nextPage();
    if (e.key === 'ArrowLeft') pdfReader.prevPage();
  });
});