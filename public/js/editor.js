document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('writeForm');

  if (!form) return;

  const title = document.getElementById('title');
  const content = document.getElementById('content');

  const words = document.getElementById('words');
  const chars = document.getElementById('chars');

  const preview = document.getElementById('preview');
  const previewTitle = document.getElementById('previewTitle');
  const previewBody = document.getElementById('previewBody');

  const rtl = document.getElementById('rtl');
  const language = document.getElementById('language');

  const previewBtn = document.getElementById('previewBtn');

  function updateCounts() {
    const text = content.value;

    const wordCount = text.trim()
      ? text.trim().split(/\s+/).length
      : 0;

    words.textContent = wordCount;
    chars.textContent = text.length;
  }

  function updatePreview() {
    const poemTitle = title.value.trim() || 'Your poem title will appear here';

    previewTitle.textContent = poemTitle;

    previewBody.textContent = content.value ||
      'Your poem content will appear here.';

    const isUrdu = rtl.checked || language.value === 'Urdu';

    preview.dir = isUrdu ? 'rtl' : 'ltr';
    preview.classList.toggle('preview-align-right', isUrdu);
    preview.classList.toggle('preview-align-left', !isUrdu);
  }

  content.addEventListener('input', () => {
    updateCounts();
    updatePreview();
  });

  title.addEventListener('input', updatePreview);

  if (language) {
    language.addEventListener('change', () => {
      if (language.value === 'Urdu') {
        rtl.checked = true;
      } else {
        rtl.checked = false;
      }

      updatePreview();
    });
  }

  rtl.addEventListener('change', updatePreview);

  previewBtn.addEventListener('click', () => {
    updateCounts();
    updatePreview();

    preview.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  });

  form.addEventListener('submit', event => {
    const image = document.getElementById('coverImage');
    const pdf = document.getElementById('poemPdf');

    const maxSize = 10 * 1024 * 1024;

    if (image.files.length && image.files[0].size > maxSize) {
      event.preventDefault();
      alert('Cover image must not exceed 10 MB.');
      return;
    }

    if (pdf.files.length && pdf.files[0].size > maxSize) {
      event.preventDefault();
      alert('PDF document must not exceed 10 MB.');
    }
  });

  updateCounts();
  updatePreview();
});
